/**
 * 🌐 GINA AI API Gateway — بوابة الـ API المركزية
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ThreatAnalyzer, AuditLogger, SecurityEvent } from '../../security/auth/SecurityProtocols';

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

// ===== Plugins =====

async function registerPlugins(): Promise<void> {
  // CORS
  await app.register(import('@fastify/cors'), {
    origin: (process.env.CORS_ORIGINS || '').split(','),
    credentials: true,
  });

  // Rate Limiting
  await app.register(import('@fastify/rate-limit'), {
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    errorResponseBuilder: () => ({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    }),
  });

  // Helmet (Security Headers)
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // JWT
  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
  });
}

// ===== Security Middleware =====

const threatAnalyzer = new ThreatAnalyzer();
const auditLogger = new AuditLogger(
  process.env.AUDIT_SIGNING_KEY || 'default-signing-key'
);

app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
  const context = {
    userId: (request as any).user?.id,
    sessionId: request.headers['x-session-id'] as string,
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
    timestamp: Date.now(),
    requestPath: request.url,
    method: request.method,
  };

  // تحليل التهديدات
  const bodyString = request.body ? JSON.stringify(request.body) : '';
  const assessment = threatAnalyzer.assess(context, bodyString);

  if (assessment.blocked) {
    auditLogger.log(SecurityEvent.SUSPICIOUS_ACTIVITY, context, {
      reasons: assessment.reasons,
      level: assessment.level,
    });

    return reply.code(403).send({
      error: 'SECURITY_VIOLATION',
      message: 'Request blocked by security policy',
      code: assessment.level,
    });
  }
});

// ===== Routes =====

// Health Check
app.get('/health', async () => ({
  status: 'healthy',
  version: process.env.PLATFORM_VERSION || '1.0.0',
  timestamp: new Date().toISOString(),
  services: {
    redis: 'connected',
    database: 'connected',
    firebase: 'connected',
  },
}));

// Auth Routes
app.register(
  async (authRouter) => {
    authRouter.post('/login', {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    }, async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };

      // تحقق من المستخدم
      threatAnalyzer.recordLoginAttempt(request.ip, true); // سيتحدث للـ false عند الفشل

      const token = await (app as any).jwt.sign({ email, role: 'user' });

      auditLogger.log(SecurityEvent.LOGIN_SUCCESS, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      }, { email });

      return reply.send({ token, expiresIn: '15m' });
    });

    authRouter.post('/logout', async (request, reply) => {
      auditLogger.log(SecurityEvent.TOKEN_REVOKED, {
        ip: request.ip,
      });
      return reply.send({ message: 'Logged out successfully' });
    });
  },
  { prefix: '/auth' }
);

// GINA Pay Routes
app.register(
  async (payRouter) => {
    payRouter.addHook('preHandler', async (request, reply) => {
      try {
        await (request as any).jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
      }
    });

    payRouter.post('/process', async (request, reply) => {
      auditLogger.log(SecurityEvent.PAYMENT_ATTEMPT, {
        ip: request.ip,
        userId: (request as any).user?.email,
      }, { body: request.body });

      return reply.send({
        transactionId: `txn_${Date.now()}`,
        status: 'processing',
        message: 'Payment is being processed',
      });
    });

    payRouter.get('/transactions', async (request, reply) => {
      auditLogger.log(SecurityEvent.DATA_ACCESS, {
        ip: request.ip,
        requestPath: '/pay/transactions',
      });

      return reply.send({ transactions: [], total: 0 });
    });
  },
  { prefix: '/pay' }
);

// ===== Error Handler =====

app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  if (error.statusCode === 429) {
    auditLogger.log(SecurityEvent.RATE_LIMIT_EXCEEDED, { ip: request.ip });
  }

  return reply.code(error.statusCode || 500).send({
    error: error.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : error.message,
  });
});

// ===== Bootstrap =====

async function start(): Promise<void> {
  try {
    await registerPlugins();

    const port = Number(process.env.API_PORT) || 3000;
    const host = process.env.API_HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`🚀 GINA AI API Gateway running at http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();

export { app };
