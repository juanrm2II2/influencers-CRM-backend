import {
  EnvKeyProvider,
  AwsKmsKeyProvider,
  AwsSecretsManagerKeyProvider,
  createKeyProvider,
  initializeKeyProvider,
  getJwtSecret,
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
        'KMS_KEY_ID and KMS_ENCRYPTED_SECRET must be set',
      );
    }),
  );

  it(
    'should throw when KMS_ENCRYPTED_SECRET is missing',
    withEnv({ KMS_KEY_ID: 'arn:key', KMS_ENCRYPTED_SECRET: undefined }, () => {
      expect(() => new AwsKmsKeyProvider()).toThrow(
        'KMS_KEY_ID and KMS_ENCRYPTED_SECRET must be set',
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
        'AWS_SECRET_ARN must be set',
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
});
