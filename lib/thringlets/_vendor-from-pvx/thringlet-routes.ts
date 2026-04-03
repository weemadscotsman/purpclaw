import express from 'express';
import * as thringletController from '../controllers/thringletController';

const router = express.Router();

/**
 * Send input to thringlet emotion engine
 * POST /api/thringlet/input
 */
router.post('/input', thringletController.processInput);

/**
 * Get current thringlet status
 * GET /api/thringlet/status/:id
 */
router.get('/status/:id', thringletController.getStatus);

/**
 * Get thringlet emotion history
 * GET /api/thringlet/emotions/:id
 */
router.get('/emotions/:id', thringletController.getEmotionHistory);

/**
 * Create new thringlet
 * POST /api/thringlet/create
 */
router.post('/create', thringletController.createThringlet);

/**
 * Get all thringlets
 * GET /api/thringlet/all
 */
router.get('/all', thringletController.getAllThringlets);

/**
 * Get thringlet personality traits
 * GET /api/thringlet/personality/:id
 */
router.get('/personality/:id', thringletController.getThringletPersonality);

/**
 * Get general personality traits
 * GET /api/thringlet/personality 
 */
router.get('/personality', thringletController.getGenericPersonality);

/**
 * Update thringlet personality based on blockchain activity
 * POST /api/thringlet/update-personality
 */
router.post('/update-personality', thringletController.updatePersonalityFromActivity);

/**
 * Get personalized response from thringlet based on personality
 * POST /api/thringlet/personality-response
 */
router.post('/personality-response', thringletController.getPersonalizedResponse);

export default router;