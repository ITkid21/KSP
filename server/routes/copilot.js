const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const copilotService = require('../services/copilotService');
const predictionService = require('../services/predictionService');

const router = express.Router();

/**
 * Helper to verify case workspace access (Case-level permission)
 * super_admin has access to everything.
 * Other roles must be explicitly listed in the assigned_officers list.
 */
function verifyCaseAccess(req, res, next) {
  const caseId = req.params.id;
  const username = req.user.username;
  const role = req.user.role;

  const caseObj = db.findOne('cases', c => c.id === caseId);
  if (!caseObj) {
    return res.status(404).json({ error: 'Case workspace not found.' });
  }

  if (role !== 'super_admin' && !caseObj.assigned_officers.includes(username)) {
    // Log unauthorized access attempt
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'UNAUTHORIZED_CASE_ACCESS_ATTEMPT',
      resource: 'cases',
      resource_id: caseId,
      details: `User ${username} attempted to access case ${caseId} without assignment.`,
      created_at: new Date().toISOString()
    });
    return res.status(403).json({ error: 'Access denied. You are not assigned to this case.' });
  }

  req.caseObj = caseObj;
  next();
}

/**
 * GET /api/copilot/cases - List all cases the user is authorized to view
 */
router.get('/cases', authenticateToken, (req, res) => {
  try {
    const { username, role } = req.user;
    let cases = db.getAll('cases');

    if (role !== 'super_admin') {
      cases = cases.filter(c => c.assigned_officers.includes(username));
    }

    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/copilot/cases - Create a new case workspace
 */
router.post('/cases', authenticateToken, (req, res) => {
  try {
    const { id, name, assigned_officers } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'Case ID and Name are required.' });
    }

    // Check duplicate
    if (db.findOne('cases', c => c.id === id)) {
      return res.status(400).json({ error: 'Case ID already exists.' });
    }

    const newCaseObj = {
      id: id.trim(),
      name: name.trim(),
      assigned_officers: Array.isArray(assigned_officers) ? assigned_officers : [req.user.username],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.insert('cases', newCaseObj);

    // Audit log
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'CREATE_CASE_WORKSPACE',
      resource: 'cases',
      resource_id: newCaseObj.id,
      details: `Created Case Workspace: ${newCaseObj.name}`,
      created_at: new Date().toISOString()
    });

    res.status(201).json(newCaseObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/cases/:id - Retrieve single case detail (docs + history)
 */
router.get('/cases/:id', authenticateToken, verifyCaseAccess, (req, res) => {
  try {
    const caseId = req.params.id;
    const documents = db.getAll('documents').filter(d => d.case_id === caseId);
    const chats = db.getAll('copilot_chats').filter(c => c.case_id === caseId);

    // Log access
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'VIEW_CASE_WORKSPACE',
      resource: 'cases',
      resource_id: caseId,
      details: `Accessed Case Workspace details`,
      created_at: new Date().toISOString()
    });

    res.json({
      case: req.caseObj,
      documents,
      chat_history: chats.slice(-50) // Return last 50 messages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/copilot/cases/:id/documents - Upload case document & run chunking/embeddings
 */
router.post('/cases/:id/documents', authenticateToken, verifyCaseAccess, (req, res) => {
  try {
    const caseId = req.params.id;
    const { name, doc_type, content, collection_type } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Document Name and Content are required.' });
    }

    const doc = copilotService.addDocument({
      caseId,
      collectionType: collection_type || 'case_files',
      name: name.trim(),
      docType: doc_type || 'Case File',
      content: content.trim(),
      uploadedBy: req.user.username
    });

    // Log upload
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'UPLOAD_CASE_DOCUMENT',
      resource: 'documents',
      resource_id: doc.id,
      details: `Uploaded file '${name}' to case ${caseId} under ${collection_type || 'case_files'}`,
      created_at: new Date().toISOString()
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/copilot/cases/:id/chat - Copilot Chat endpoint (retrieves local chunks, queries AI)
 */
router.post('/cases/:id/chat', authenticateToken, verifyCaseAccess, async (req, res) => {
  try {
    const caseId = req.params.id;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    // Perform vector search locally across this case files, judgments, and legal references
    const matchedChunks = copilotService.vectorSearch({
      caseId,
      collectionTypes: ['case_files', 'judgments', 'legal_references'],
      query: message,
      limit: 6 // 5-10 chunks limit constraint
    });

    // Construct context for the AI prompt
    const contextSnippet = matchedChunks.map(c => 
      `Source File: [${c.document_name}] (${c.collection_type})\nContent:\n${c.text}`
    ).join('\n\n');

    const systemInstruction = `You are "KSP Investigation Copilot", a specialized police intelligence assistant.
    Help the officer analyze the uploaded files for case workspace "${req.caseObj.name}" (${caseId}).
    Use ONLY the retrieved case documents, legal references, and court judgments provided in the context below.
    If you do not know or if the context does not contain the answer, state that clearly.
    Always quote specific files and clauses when providing evidence or legal definitions.
    
    Matched Context:\n${contextSnippet}`;

    const answer = await copilotService.askAI(message, systemInstruction);

    // Save chat message
    const chatMsg = {
      id: uuidv4(),
      case_id: caseId,
      user_id: req.user.id,
      username: req.user.username,
      message,
      response: answer,
      sources: matchedChunks.map(c => ({
        document_name: c.document_name,
        collection_type: c.collection_type,
        snippet: c.text.substring(0, 100) + '...',
        similarity: c.similarity
      })),
      created_at: new Date().toISOString()
    };

    db.insert('copilot_chats', chatMsg);

    // Log chat audit
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'COPILOT_CHAT_QUERY',
      resource: 'copilot',
      resource_id: caseId,
      details: `Queried copilot: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
      created_at: new Date().toISOString()
    });

    res.json(chatMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/cases/:id/summary - Fetch or generate case summary
 */
router.get('/cases/:id/summary', authenticateToken, verifyCaseAccess, async (req, res) => {
  try {
    const caseId = req.params.id;
    const summary = await copilotService.generateCaseSummary(caseId);
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/copilot/cases/:id/summary - Force regenerate summary
 */
router.post('/cases/:id/summary', authenticateToken, verifyCaseAccess, async (req, res) => {
  try {
    const caseId = req.params.id;
    // Clear cache
    db.remove('copilot_caches', c => c.case_id === caseId && c.type === 'summary');
    const summary = await copilotService.generateCaseSummary(caseId);
    
    // Log audit
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'GENERATE_CASE_SUMMARY',
      resource: 'cases',
      resource_id: caseId,
      details: `Regenerated Case Summary`,
      created_at: new Date().toISOString()
    });

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/cases/:id/timeline - Fetch or generate case timeline
 */
router.get('/cases/:id/timeline', authenticateToken, verifyCaseAccess, async (req, res) => {
  try {
    const caseId = req.params.id;
    const timeline = await copilotService.generateCaseTimeline(caseId);
    res.json(timeline);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/copilot/cases/:id/timeline - Force regenerate timeline
 */
router.post('/cases/:id/timeline', authenticateToken, verifyCaseAccess, async (req, res) => {
  try {
    const caseId = req.params.id;
    // Clear cache
    db.remove('copilot_caches', c => c.case_id === caseId && c.type === 'timeline');
    const timeline = await copilotService.generateCaseTimeline(caseId);

    // Log audit
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'GENERATE_CASE_TIMELINE',
      resource: 'cases',
      resource_id: caseId,
      details: `Regenerated Case Timeline`,
      created_at: new Date().toISOString()
    });

    res.json(timeline);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/judgments/search - Global similarity search across Judgments/Legal References
 */
router.get('/judgments/search', authenticateToken, (req, res) => {
  try {
    const { query, collection } = req.query; // collection: 'judgments' or 'legal_references' or both
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required.' });
    }

    const collections = collection ? [collection] : ['judgments', 'legal_references'];
    const matched = copilotService.vectorSearch({
      caseId: null, // Global search
      collectionTypes: collections,
      query: query,
      limit: 5
    });

    // Log search
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'JUDGMENT_LEGAL_SEARCH',
      resource: 'copilot',
      details: `Searched court judgments/legal acts with query: "${query}"`,
      created_at: new Date().toISOString()
    });

    res.json(matched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/predictions/explain - Explain prediction details using PredictionService
 */
router.get('/predictions/explain', authenticateToken, (req, res) => {
  try {
    const { district, crime_type } = req.query;
    if (!district || !crime_type) {
      return res.status(400).json({ error: 'District and crime_type parameters are required.' });
    }

    const explanation = predictionService.explainPrediction(district, crime_type);

    // Log prediction explanation check
    db.insert('audit_logs', {
      id: uuidv4(),
      user_id: req.user.id,
      action: 'EXPLAIN_HOTSPOT_PREDICTION',
      resource: 'predictions',
      details: `Requested prediction explanation for ${district} (${crime_type})`,
      created_at: new Date().toISOString()
    });

    res.json(explanation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/copilot/test-db - Test database connection with Catalyst ZCQL
 */
router.get('/test-db', async (req, res) => {
  try {
    console.log("Catalyst App:", req.catalystApp);

    if (!req.catalystApp) {
      return res.status(500).json({
        success: false,
        error: "Catalyst SDK not initialized"
      });
    }

    const zcql = req.catalystApp.zcql();

    const result = await zcql.executeZCQLQuery(
      "SELECT * FROM system_users LIMIT 1"
    );

    res.json({
      success: true,
      recordsFound: result.length,
      data: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
