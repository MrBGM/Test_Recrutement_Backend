/**
 * Point d'entree du serveur backend AI Chat
 * Serveur Express avec API REST pour les services IA
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

// Routes
import aiRoutes from './routes/ai.routes.js';
import healthRoutes from './routes/health.routes.js';

// Valider la configuration
validateConfig();

// Creer l'application Express
const app = express();

// ===== MIDDLEWARES DE SECURITE =====

// Helmet pour les headers de securite
app.use(helmet());

// CORS - Configuration améliorée pour le développement
const corsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (ex: mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // En développement : autoriser tous les localhost
    if (config.nodeEnv === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    // Vérifier si l'origine est dans la liste autorisée
    const allowedOrigins = config.cors.origins;
    
    // Si '*' est dans la config, tout autoriser
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Vérifier si l'origine exacte est autorisée
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // En production, refuser les origines non autorisées
    if (config.isProduction) {
      logger.warn(`CORS: Origine refusée: ${origin}`);
      return callback(new Error('Non autorisé par CORS'));
    }

    // En dev, accepter par défaut
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200, // Pour les anciens navigateurs
  maxAge: 86400, // Cache preflight pendant 24h
};

app.use(cors(corsOptions));

// Middleware pour logger les requêtes CORS en développement
if (!config.isProduction) {
  app.use((req, res, next) => {
    logger.debug(`CORS Request - Origin: ${req.headers.origin || 'none'} - Method: ${req.method} - Path: ${req.path}`);
    next();
  });
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Trop de requetes, veuillez reessayer plus tard',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Ne pas appliquer le rate limit en développement pour faciliter les tests
  skip: (req) => !config.isProduction && req.path.startsWith('/health'),
});

app.use('/api/', limiter);

// ===== MIDDLEWARES UTILITAIRES =====

// Parser JSON
app.use(express.json({ limit: '1mb' }));

// Parser URL-encoded
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging des requetes (format dev ou combined selon l'environnement)
app.use(morgan(config.isProduction ? 'combined' : 'dev', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// ===== ROUTES =====

// Routes de sante (pas de rate limit)
app.use('/health', healthRoutes);

// Routes API
app.use('/api/ai', aiRoutes);

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'AI Chat Backend',
    version: '1.0.0',
    description: 'API pour les services d\'intelligence artificielle conversationnelle',
    status: 'running',
    environment: config.nodeEnv,
    cors: {
      enabled: true,
      mode: config.nodeEnv === 'development' ? 'permissive (localhost)' : 'restricted',
    },
    endpoints: {
      health: '/health',
      ai: {
        suggest: 'POST /api/ai/suggest',
        analyze: 'POST /api/ai/analyze',
        status: 'GET /api/ai/status',
        suggestMultiple: 'POST /api/ai/suggest-multiple',
      },
    },
    documentation: '/docs',
  });
});

// ===== GESTION DES ERREURS =====

// Route non trouvee
app.use(notFoundHandler);

// Gestionnaire d'erreurs global
app.use(errorHandler);

// ===== DEMARRAGE DU SERVEUR =====

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`🚀 Serveur demarre sur le port ${PORT}`);
  logger.info(`📍 Environnement: ${config.nodeEnv}`);
  logger.info(`🤖 Service IA: ${config.groq.apiKey ? '✅ configuré' : '❌ non configuré'}`);
  logger.info(`🌐 CORS: ${config.nodeEnv === 'development' ? '✅ Mode développement (permissif)' : '🔒 Mode production (restrictif)'}`);
  logger.info(`📖 Documentation: http://localhost:${PORT}/`);
  
  if (!config.isProduction) {
    logger.info(`💡 Mode développement - Tous les localhost sont autorisés`);
  }
});

// Gestion des erreurs non capturees
process.on('uncaughtException', (error) => {
  logger.error('Erreur non capturee', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesse rejetee non geree', { reason, promise });
});

// Gestion de l'arret gracieux
process.on('SIGTERM', () => {
  logger.info('Signal SIGTERM recu - Arret gracieux');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Signal SIGINT recu - Arret gracieux');
  process.exit(0);
});

export default app;