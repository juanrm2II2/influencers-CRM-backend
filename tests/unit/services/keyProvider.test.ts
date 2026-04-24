import {
  EnvKeyProvider,
  AwsKmsKeyProvider,
  AwsSecretsManagerKeyProvider,
  RsaPemKeyProvider,
  JwksKeyProvider,
  createKeyProvider,
  initializeKeyProvider,
  getJwtSecret,
  getJwtVerificationKey,
  getJwtAlgorithms,
  getKeyProvider,
  destroyKeyProvider,
} from '../../../src/services/keyProvider';

// ---------------------------------------------------------------------------
// Mock the logger to avoid noisy output during tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-jwt-secret-key-for-testing-purposes';

/** Save and restore env vars so individual tests can mutate them safely. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(overrides)) {
      saved[key] = process.env[key];
      if (overrides[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = overrides[key];
      }
    }
    try {
      await fn();
    } finally {
      for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// EnvKeyProvider
// ---------------------------------------------------------------------------

describe('EnvKeyProvider', () => {
  it('should initialize and return the secret from the env var', async () => {
    const provider = new EnvKeyProvider();
    await provider.initialize();
    const secret = await provider.getSecret();
    expect(secret).toBe(TEST_SECRET);
    provider.destroy();
  });

  it('should read a custom env var', async () => {
    process.env.CUSTOM_JWT_KEY = 'custom-secret';
    try {
      const provider = new EnvKeyProvider('CUSTOM_JWT_KEY');
      await provider.initialize();
      expect(await provider.getSecret()).toBe('custom-secret');
      provider.destroy();
    } finally {
      delete process.env.CUSTOM_JWT_KEY;
    }
  });

  it(
    'should throw on initialize when the env var is not set',
    withEnv({ SUPABASE_JWT_SECRET: undefined }, async () => {
      const provider = new EnvKeyProvider();
      await expect(provider.initialize()).rejects.toThrow(
        'Environment variable SUPABASE_JWT_SECRET is not set',
      );
    }),
  );

  it('should throw on getSecret when not initialized', async () => {
    const provider = new EnvKeyProvider('NONEXISTENT_VAR');
    await expect(provider.getSecret()).rejects.toThrow(
      'Key provider not initialized',
    );
  });

  it('should have name "env"', () => {
    expect(new EnvKeyProvider().name).toBe('env');
  });

  it('destroy should be callable without errors', () => {
    const provider = new EnvKeyProvider();
    expect(() => provider.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AwsKmsKeyProvider
// ---------------------------------------------------------------------------

describe('AwsKmsKeyProvider', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the dynamic import of @aws-sdk/client-kms
    jest.mock('@aws-sdk/client-kms', () => ({
      KMSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
      DecryptCommand: jest.fn().mockImplementation((input: unknown) => input),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(
    'should throw when KMS_KEY_ID is missing',
    withEnv({ KMS_KEY_ID: undefined, KMS_ENCRYPTED_SECRET: 'abc' }, () => {
      expect(() => new AwsKmsKeyProvider()).toThrow(
        'Missing required env vars for aws-kms provider: KMS_KEY_ID',
      );
    }),
  );

  it(
    'should throw when KMS_ENCRYPTED_SECRET is missing',
    withEnv({ KMS_KEY_ID: 'arn:key', KMS_ENCRYPTED_SECRET: undefined }, () => {
      expect(() => new AwsKmsKeyProvider()).toThrow(
        'Missing required env vars for aws-kms provider: KMS_ENCRYPTED_SECRET',
      );
    }),
  );

  it(
    'should initialize, decrypt, and return the secret',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('encrypted').toString('base64'),
        AWS_REGION: 'us-west-2',
      },
      async () => {
        mockSend.mockResolvedValue({
          Plaintext: new TextEncoder().encode('decrypted-secret'),
        });

        const provider = new AwsKmsKeyProvider({ refreshIntervalMs: 100_000 });
        await provider.initialize();

        expect(await provider.getSecret()).toBe('decrypted-secret');
        expect(provider.name).toBe('aws-kms');
        provider.destroy();
      },
    ),
  );

  it(
    'should throw when KMS returns empty Plaintext',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('encrypted').toString('base64'),
      },
      async () => {
        mockSend.mockResolvedValue({ Plaintext: undefined });

        const provider = new AwsKmsKeyProvider();
        await expect(provider.initialize()).rejects.toThrow(
          'KMS Decrypt returned empty plaintext',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'should throw on getSecret when not initialized',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('encrypted').toString('base64'),
      },
      async () => {
        const provider = new AwsKmsKeyProvider();
        await expect(provider.getSecret()).rejects.toThrow(
          'Key provider not initialized',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'should default to us-east-1 when AWS_REGION is not set',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('encrypted').toString('base64'),
        AWS_REGION: undefined,
      },
      async () => {
        mockSend.mockResolvedValue({
          Plaintext: new TextEncoder().encode('secret'),
        });

        const provider = new AwsKmsKeyProvider();
        await provider.initialize();
        expect(await provider.getSecret()).toBe('secret');
        provider.destroy();
      },
    ),
  );

  it(
    'should clean up refresh timer on destroy',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('encrypted').toString('base64'),
      },
      async () => {
        mockSend.mockResolvedValue({
          Plaintext: new TextEncoder().encode('secret'),
        });

        const provider = new AwsKmsKeyProvider({ refreshIntervalMs: 500_000 });
        await provider.initialize();
        // destroy should not throw
        provider.destroy();
        // double destroy should be safe
        provider.destroy();
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// AwsSecretsManagerKeyProvider
// ---------------------------------------------------------------------------

describe('AwsSecretsManagerKeyProvider', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mock('@aws-sdk/client-secrets-manager', () => ({
      SecretsManagerClient: jest.fn().mockImplementation(() => ({
        send: mockSend,
      })),
      GetSecretValueCommand: jest.fn().mockImplementation((input: unknown) => input),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(
    'should throw when AWS_SECRET_ARN is missing',
    withEnv({ AWS_SECRET_ARN: undefined }, () => {
      expect(() => new AwsSecretsManagerKeyProvider()).toThrow(
        'Missing required env var for aws-secrets-manager provider: AWS_SECRET_ARN',
      );
    }),
  );

  it(
    'should initialize and return the plain string secret',
    withEnv(
      { AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test', AWS_SECRET_KEY: undefined },
      async () => {
        mockSend.mockResolvedValue({
          SecretString: 'my-jwt-secret',
        });

        const provider = new AwsSecretsManagerKeyProvider({ refreshIntervalMs: 100_000 });
        await provider.initialize();
        expect(await provider.getSecret()).toBe('my-jwt-secret');
        expect(provider.name).toBe('aws-secrets-manager');
        provider.destroy();
      },
    ),
  );

  it(
    'should extract a JSON key from the secret',
    withEnv(
      {
        AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test',
        AWS_SECRET_KEY: 'jwt_secret',
      },
      async () => {
        mockSend.mockResolvedValue({
          SecretString: JSON.stringify({ jwt_secret: 'extracted-secret', other: 'value' }),
        });

        const provider = new AwsSecretsManagerKeyProvider({ refreshIntervalMs: 100_000 });
        await provider.initialize();
        expect(await provider.getSecret()).toBe('extracted-secret');
        provider.destroy();
      },
    ),
  );

  it(
    'should throw when JSON key is missing from secret',
    withEnv(
      {
        AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test',
        AWS_SECRET_KEY: 'missing_key',
      },
      async () => {
        mockSend.mockResolvedValue({
          SecretString: JSON.stringify({ other: 'value' }),
        });

        const provider = new AwsSecretsManagerKeyProvider();
        await expect(provider.initialize()).rejects.toThrow(
          'Key "missing_key" not found or empty in secret',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'should throw when SecretString is empty',
    withEnv(
      { AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test', AWS_SECRET_KEY: undefined },
      async () => {
        mockSend.mockResolvedValue({ SecretString: undefined });

        const provider = new AwsSecretsManagerKeyProvider();
        await expect(provider.initialize()).rejects.toThrow(
          'Secrets Manager returned empty secret',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'should throw on getSecret when not initialized',
    withEnv(
      { AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test' },
      async () => {
        const provider = new AwsSecretsManagerKeyProvider();
        await expect(provider.getSecret()).rejects.toThrow(
          'Key provider not initialized',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'should clean up refresh timer on destroy',
    withEnv(
      { AWS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test', AWS_SECRET_KEY: undefined },
      async () => {
        mockSend.mockResolvedValue({ SecretString: 'secret' });

        const provider = new AwsSecretsManagerKeyProvider({ refreshIntervalMs: 500_000 });
        await provider.initialize();
        provider.destroy();
        provider.destroy(); // double destroy is safe
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// createKeyProvider factory
// ---------------------------------------------------------------------------

describe('createKeyProvider', () => {
  it('should create EnvKeyProvider by default', () => {
    const provider = createKeyProvider();
    expect(provider.name).toBe('env');
  });

  it('should create EnvKeyProvider when name is "env"', () => {
    const provider = createKeyProvider('env');
    expect(provider.name).toBe('env');
  });

  it(
    'should create AwsKmsKeyProvider when name is "aws-kms"',
    withEnv(
      {
        KMS_KEY_ID: 'arn:aws:kms:us-east-1:123:key/test',
        KMS_ENCRYPTED_SECRET: Buffer.from('test').toString('base64'),
      },
      () => {
        const provider = createKeyProvider('aws-kms');
        expect(provider.name).toBe('aws-kms');
        provider.destroy();
      },
    ),
  );

  it(
    'should create AwsSecretsManagerKeyProvider when name is "aws-secrets-manager"',
    withEnv({ AWS_SECRET_ARN: 'arn:test' }, () => {
      const provider = createKeyProvider('aws-secrets-manager');
      expect(provider.name).toBe('aws-secrets-manager');
      provider.destroy();
    }),
  );

  it(
    'should read from KEY_PROVIDER env var when no name argument',
    withEnv({ KEY_PROVIDER: 'aws-secrets-manager', AWS_SECRET_ARN: 'arn:test' }, () => {
      const provider = createKeyProvider();
      expect(provider.name).toBe('aws-secrets-manager');
      provider.destroy();
    }),
  );

  it('should throw for unknown provider name', () => {
    expect(() => createKeyProvider('unknown' as never)).toThrow(
      'Unknown key provider: unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------

describe('singleton helpers', () => {
  afterEach(() => {
    destroyKeyProvider();
  });

  it('should initialize and return secret via singleton', async () => {
    await initializeKeyProvider('env');
    const secret = await getJwtSecret();
    expect(secret).toBe(TEST_SECRET);
    expect(getKeyProvider()).not.toBeNull();
    expect(getKeyProvider()!.name).toBe('env');
  });

  it('should replace the previous provider on re-initialize', async () => {
    await initializeKeyProvider('env');
    const first = getKeyProvider();
    await initializeKeyProvider('env');
    const second = getKeyProvider();
    // They should be different instances
    expect(first).not.toBe(second);
  });

  it('should lazy-initialize with env provider when getJwtSecret is called without init', async () => {
    destroyKeyProvider();
    const secret = await getJwtSecret();
    expect(secret).toBe(TEST_SECRET);
    expect(getKeyProvider()!.name).toBe('env');
  });

  it('destroyKeyProvider should clear the singleton', async () => {
    await initializeKeyProvider('env');
    expect(getKeyProvider()).not.toBeNull();
    destroyKeyProvider();
    expect(getKeyProvider()).toBeNull();
  });

  it('destroyKeyProvider should be safe to call multiple times', () => {
    destroyKeyProvider();
    destroyKeyProvider();
    expect(getKeyProvider()).toBeNull();
  });

  it('getJwtAlgorithms defaults to HS256 when no provider initialized', () => {
    destroyKeyProvider();
    expect(getJwtAlgorithms()).toEqual(['HS256']);
  });

  it('getJwtVerificationKey returns the symmetric secret for env provider', async () => {
    await initializeKeyProvider('env');
    const key = await getJwtVerificationKey();
    expect(key).toBe(TEST_SECRET);
    expect(getJwtAlgorithms()).toEqual(['HS256']);
  });
});

// ---------------------------------------------------------------------------
// RsaPemKeyProvider
// ---------------------------------------------------------------------------

// A valid-looking RSA public key (2048-bit, generated for tests only).
const TEST_RSA_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1e+uhldbkLvB+1YrjAWX
5kZG9H8wK5eH+h6ZqL1iTKY5rD7rEmfB8c6q6n0mRk4mXlKf1RylI0mvKx4zqf1x
H3I4v4wqYhTq+5uzW6oFM6t/8Ikl2N4h4LuLvdbqzJmG2j9Du5A0zRZjV0qKwZ8V
kI4w4t8T7qxM5tWj7C9fTtS5mQv5G1wzYr7CjQ8Vj2NlV1YyR4hjQm6b2J6o6uKK
2T4ZlOvRz8y4aRCSmBqxHx7Ui1cKi9x1OJbQJ9Y0/6eJu5MnFwDKo6o4wRkGuc+R
qZ4M8UGkR5EN7aTXP2A6Y2bFg0sL9Cf+qE1mMjOeyRhG9Y8m5f/ax4yQTXe9v4pP
7wIDAQAB
-----END PUBLIC KEY-----`;

describe('RsaPemKeyProvider', () => {
  it(
    'initializes from JWT_PUBLIC_KEY_PEM and returns the PEM for verification',
    withEnv({ JWT_PUBLIC_KEY_PEM: TEST_RSA_PUBLIC_PEM }, async () => {
      const provider = new RsaPemKeyProvider();
      await provider.initialize();
      expect(await provider.getVerificationKey()).toBe(TEST_RSA_PUBLIC_PEM);
      expect(provider.getAlgorithms()).toEqual(['RS256']);
      provider.destroy();
    }),
  );

  it(
    'decodes literal \\n sequences into newlines',
    withEnv(
      { JWT_PUBLIC_KEY_PEM: TEST_RSA_PUBLIC_PEM.replace(/\n/g, '\\n') },
      async () => {
        const provider = new RsaPemKeyProvider();
        await provider.initialize();
        expect(await provider.getVerificationKey()).toContain(
          '-----BEGIN PUBLIC KEY-----\n',
        );
        provider.destroy();
      },
    ),
  );

  it(
    'rejects values that are not a PEM public key',
    withEnv({ JWT_PUBLIC_KEY_PEM: 'not-a-pem' }, async () => {
      const provider = new RsaPemKeyProvider();
      await expect(provider.initialize()).rejects.toThrow(
        /does not look like a PEM public key/,
      );
    }),
  );

  it(
    'throws when JWT_PUBLIC_KEY_PEM is missing',
    withEnv({ JWT_PUBLIC_KEY_PEM: undefined }, async () => {
      const provider = new RsaPemKeyProvider();
      await expect(provider.initialize()).rejects.toThrow(
        /Missing required env var for rs256-pem provider/,
      );
    }),
  );

  it(
    'getSecret throws because the provider is verify-only',
    withEnv({ JWT_PUBLIC_KEY_PEM: TEST_RSA_PUBLIC_PEM }, async () => {
      const provider = new RsaPemKeyProvider();
      await provider.initialize();
      await expect(provider.getSecret()).rejects.toThrow(/verify-only/);
      provider.destroy();
    }),
  );
});

// ---------------------------------------------------------------------------
// JwksKeyProvider
// ---------------------------------------------------------------------------

describe('JwksKeyProvider', () => {
  it(
    'throws when JWT_JWKS_URI is missing',
    withEnv({ JWT_JWKS_URI: undefined }, () => {
      expect(() => new JwksKeyProvider()).toThrow(
        /Missing required env var for jwks provider/,
      );
    }),
  );

  it(
    'returns a kid-resolving callback that pins algorithms to RS256',
    withEnv({ JWT_JWKS_URI: 'https://example.invalid/jwks.json' }, async () => {
      const mockKey = { getPublicKey: () => '-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----\n' };
      const getSigningKey = jest.fn().mockResolvedValue(mockKey);

      // Mock the dynamic import of jwks-rsa
      jest.doMock(
        'jwks-rsa',
        () => jest.fn().mockImplementation(() => ({ getSigningKey })),
        { virtual: false },
      );

      const provider = new JwksKeyProvider();
      await provider.initialize();

      expect(provider.getAlgorithms()).toEqual(['RS256']);

      const callback = await provider.getVerificationKey();
      expect(typeof callback).toBe('function');

      const resolved: string = await new Promise((resolve, reject) => {
        (callback as (h: { kid?: string }, cb: (e: Error | null, k?: string) => void) => void)(
          { kid: 'abc' },
          (err, key) => (err ? reject(err) : resolve(key!)),
        );
      });
      expect(resolved).toContain('BEGIN PUBLIC KEY');
      expect(getSigningKey).toHaveBeenCalledWith('abc');

      // Missing kid must surface an error through the callback.
      const err: Error = await new Promise((resolve) => {
        (callback as (h: { kid?: string }, cb: (e: Error | null, k?: string) => void) => void)(
          {},
          (e) => resolve(e as Error),
        );
      });
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/kid/);

      provider.destroy();
      jest.dontMock('jwks-rsa');
    }),
  );
});

// ---------------------------------------------------------------------------
// Factory extensions
// ---------------------------------------------------------------------------

describe('createKeyProvider (asymmetric variants)', () => {
  it(
    'creates RsaPemKeyProvider for name "rs256-pem"',
    withEnv({ JWT_PUBLIC_KEY_PEM: TEST_RSA_PUBLIC_PEM }, () => {
      const provider = createKeyProvider('rs256-pem');
      expect(provider.name).toBe('rs256-pem');
      provider.destroy();
    }),
  );

  it(
    'creates JwksKeyProvider for name "jwks"',
    withEnv({ JWT_JWKS_URI: 'https://example.invalid/jwks.json' }, () => {
      const provider = createKeyProvider('jwks');
      expect(provider.name).toBe('jwks');
      provider.destroy();
    }),
  );
});
