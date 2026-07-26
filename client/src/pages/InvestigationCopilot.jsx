import { useState, useEffect, useRef } from 'react';

const API_URL = '/api';

export default function InvestigationCopilot({ user }) {
  // Case States
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [caseDetails, setCaseDetails] = useState(null);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Chat States
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef(null);

  // Case Summary & Timeline
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Search Judgments
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCollection, setSearchCollection] = useState('judgments');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Prediction Explainer
  const [selectedDistrict, setSelectedDistrict] = useState('BENGALURU CITY');
  const [selectedCrimeType, setSelectedCrimeType] = useState('CYBER CRIME');
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'summary' | 'timeline' | 'search' | 'explainer'

  // Modals
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseName, setNewCaseName] = useState('');
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('FIR'); // 'FIR' | 'Witness Statement' | 'Charge Sheet' | 'Investigation Notes' | 'Forensic Report'
  const [newDocCollection, setNewDocCollection] = useState('case_files'); // 'case_files' | 'judgments' | 'legal_references'
  const [newDocContent, setNewDocContent] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const token = localStorage.getItem('ksp_token');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Predefined Districts & Crimes for explainer
  const districts = ['BENGALURU CITY', 'MANGALURU CITY', 'MYSURU CITY', 'BELAGAVI', 'TUMAKURU', 'SHIVAMOGGA', 'HUBBALLI-DHARWAD CITY'];
  const crimeTypes = ['CYBER CRIME', 'THEFT', 'ROBBERY', 'MURDER', 'NARCOTICS (NDPS)', 'POCSO OFFENCES', 'RIOTING'];

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    if (selectedCaseId) {
      fetchCaseDetails(selectedCaseId);
    } else {
      setCaseDetails(null);
      setChatMessages([]);
      setSummary(null);
      setTimeline([]);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchCases = async () => {
    setLoadingCases(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCases(data);
        if (data.length > 0) {
          setSelectedCaseId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const fetchCaseDetails = async (caseId) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${caseId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCaseDetails(data);
        setChatMessages(data.chat_history || []);
        
        // Fetch summary & timeline
        fetchSummary(caseId);
        fetchTimeline(caseId);
      }
    } catch (err) {
      /* error handled silently */
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchSummary = async (caseId) => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${caseId}/summary`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setLoadingSummary(false);
    }
  };

  const generateSummary = async () => {
    if (!selectedCaseId) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${selectedCaseId}/summary`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchTimeline = async (caseId) => {
    setLoadingTimeline(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${caseId}/timeline`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setLoadingTimeline(false);
    }
  };

  const generateTimeline = async () => {
    if (!selectedCaseId) return;
    setLoadingTimeline(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${selectedCaseId}/timeline`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!newCaseId || !newCaseName) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/copilot/cases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: newCaseId, name: newCaseName })
      });
      if (res.ok) {
        const data = await res.json();
        setCases([...cases, data]);
        setSelectedCaseId(data.id);
        setShowCreateCase(false);
        setNewCaseId('');
        setNewCaseName('');
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create case');
      }
    } catch (err) {
      /* silently handled */
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!newDocName || !newDocContent) {
      return;
    }
    setUploadingDoc(true);
    try {
      const res = await fetch(`${API_URL}/copilot/cases/${selectedCaseId}/documents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newDocName,
          doc_type: newDocType,
          collection_type: newDocCollection,
          content: newDocContent
        })
      });
      if (res.ok) {
        fetchCaseDetails(selectedCaseId);
        setShowUploadDoc(false);
        setNewDocName('');
        setNewDocContent('');
      } else {
        alert('Failed to upload document');
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedCaseId) return;
    
    const userMsg = {
      id: `temp-${Date.now()}`,
      message: chatInput,
      username: user.username,
      created_at: new Date().toISOString()
    };
    
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setSendingChat(true);

    try {
      const res = await fetch(`${API_URL}/copilot/cases/${selectedCaseId}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMsg.message })
      });

      if (res.ok) {
        const reply = await res.json();
        setChatMessages(prev => prev.filter(m => m.id !== userMsg.id).concat(reply));
      } else {
        setChatMessages(prev => prev.filter(m => m.id !== userMsg.id));
      }
    } catch (err) {
      setChatMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setSendingChat(false);
    }
  };

  const handleSuggestQuery = (text) => {
    setChatInput(text);
  };

  const handleSearchJudgments = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/copilot/judgments/search?query=${encodeURIComponent(searchQuery)}&collection=${searchCollection}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setSearching(false);
    }
  };

  const handleExplainPrediction = async (e) => {
    e.preventDefault();
    setExplaining(true);
    try {
      const res = await fetch(`${API_URL}/copilot/predictions/explain?district=${encodeURIComponent(selectedDistrict)}&crime_type=${encodeURIComponent(selectedCrimeType)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setExplanation(data);
      }
    } catch (err) {
      /* silently handled */
    } finally {
      setExplaining(false);
    }
  };

  // Helper to handle text files natively
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setNewDocName(file.name);
    
    // Auto-detect type
    if (file.name.toLowerCase().includes('fir')) setNewDocType('FIR');
    else if (file.name.toLowerCase().includes('witness')) setNewDocType('Witness Statement');
    else if (file.name.toLowerCase().includes('charge')) setNewDocType('Charge Sheet');
    else if (file.name.toLowerCase().includes('forensic')) setNewDocType('Forensic Report');

    const reader = new FileReader();
    reader.onload = (event) => {
      setNewDocContent(event.target.result);
    };
    reader.readAsText(file);
  };

  // Categorize case documents
  const caseFiles = caseDetails?.documents?.filter(d => d.collection_type === 'case_files') || [];
  const caseJudgments = caseDetails?.documents?.filter(d => d.collection_type === 'judgments') || [];
  const caseReferences = caseDetails?.documents?.filter(d => d.collection_type === 'legal_references') || [];

  return (
    <div className="page-body copilot-workspace">
      
      {/* Top Header Panel */}
      <div className="copilot-header">
        <div className="header-left">
          <h2>🕵️ Investigation Copilot</h2>
          <p>AI-powered case workspace: chat with case files, search court judgments, and explain ML predictions.</p>
        </div>
        <div className="header-right">
          <div className="case-selector-group">
            <label className="form-label select-label">Active Workspace:</label>
            {loadingCases ? (
              <span className="loading-span">Loading cases...</span>
            ) : (
              <select 
                className="form-select case-select" 
                value={selectedCaseId} 
                onChange={e => setSelectedCaseId(e.target.value)}
              >
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
                ))}
              </select>
            )}
            <button className="btn btn-primary" onClick={() => setShowCreateCase(true)}>+ New Workspace</button>
        </div>
      </div>
      </div>
      {/* Page Introduction */}
      <div className="page-intro" style={{ marginBottom: 16 }}>
        <div className="page-intro-icon">🕵️</div>
        <div className="page-intro-content">
          <div className="page-intro-title">Investigation Copilot Case Workspace</div>
          <div className="page-intro-desc">
            <strong>Description:</strong> Advanced vector-similarity powered document processing and decision-support workspace simulating dynamic query expansion.
            <br />
            <strong>Purpose:</strong> To help investigators interrogate uploaded case files (FIRs, charge sheets, witness statements), search legal precedents, and examine predictive models.
            <br />
            <strong>Instructions:</strong> Select or create an Active Workspace, upload files using the Left Panel, and interact via the tabbed chat/summary/timeline windows on the right.
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="copilot-split-layout">
        
        {/* Left Panel: Uploaded Documents */}
        <aside className="copilot-docs-panel">
          <div className="panel-header">
            <h3>Case Documents</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowUploadDoc(true)}>+ Upload File</button>
          </div>

          <div className="docs-list-container">
            {loadingDetails ? (
              <div className="loading-small">Loading workspace files...</div>
            ) : (
              <>
                {/* Collection 1: Case Files */}
                <div className="doc-section">
                  <div className="doc-section-title">📁 Case Files ({caseFiles.length})</div>
                  {caseFiles.length === 0 ? (
                    <div className="no-docs">No case files uploaded.</div>
                  ) : (
                    caseFiles.map(d => (
                      <div key={d.id} className="doc-item">
                        <span className="doc-icon">📄</span>
                        <div className="doc-info">
                          <div className="doc-name" title={d.name}>{d.name}</div>
                          <div className="doc-meta">{d.doc_type} • {d.uploaded_by}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Collection 2: Judgments */}
                <div className="doc-section">
                  <div className="doc-section-title">⚖️ Judgments ({caseJudgments.length})</div>
                  {caseJudgments.length === 0 ? (
                    <div className="no-docs">No custom judgments loaded.</div>
                  ) : (
                    caseJudgments.map(d => (
                      <div key={d.id} className="doc-item">
                        <span className="doc-icon">🏛️</span>
                        <div className="doc-info">
                          <div className="doc-name" title={d.name}>{d.name}</div>
                          <div className="doc-meta">{d.doc_type}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Collection 3: Legal References */}
                <div className="doc-section">
                  <div className="doc-section-title">📖 Legal References ({caseReferences.length})</div>
                  {caseReferences.length === 0 ? (
                    <div className="no-docs">No custom references loaded.</div>
                  ) : (
                    caseReferences.map(d => (
                      <div key={d.id} className="doc-item">
                        <span className="doc-icon">📜</span>
                        <div className="doc-info">
                          <div className="doc-name" title={d.name}>{d.name}</div>
                          <div className="doc-meta">{d.doc_type}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Placeholders for Future Modules */}
          <div className="future-placeholders-list">
            <h4>💡 Platform Upgrades (Placeholders)</h4>
            <div className="placeholder-pill" title="Visualize nodes of suspects, phone calls, and crime scene vectors">🌐 Evidence Graph (Coming Soon)</div>
            <div className="placeholder-pill" title="Cross-checks statements to find contradictions in timelines">⚠️ Contradiction Detection</div>
            <div className="placeholder-pill" title="Spawn subagents conducting automated threat modeling">🤖 Multi-Agent Investigator</div>
            <div className="placeholder-pill" title="Find patterns across different police station networks">🔗 Cross-Case Intelligence</div>
            <div className="placeholder-pill" title="Real-time object recognition and suspect tracking">📹 CCTV Analytics</div>
            <div className="placeholder-pill" title="Listen to witness dictations and automatically draft reports">🎙️ Voice Assistant</div>
          </div>
        </aside>

        {/* Right Panel: Working Space Tabs */}
        <main className="copilot-main-workspace">
          
          {/* Working Space Navigation */}
          <div className="tabs copilot-tabs">
            <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Investigation Chat</button>
            <button className={`tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>📝 Case Summary</button>
            <button className={`tab ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>📅 Chronological Timeline</button>
            <button className={`tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>🔍 Legal Search</button>
            <button className={`tab ${activeTab === 'explainer' ? 'active' : ''}`} onClick={() => setActiveTab('explainer')}>🔮 ML Risk Explainer</button>
          </div>

          <div className="tab-contents">
            
            {/* TAB 1: Chat Workspace */}
            {activeTab === 'chat' && (
              <div className="chat-tab-view">
                
                {/* Messages Body */}
                <div className="chat-messages-container">
                  {chatMessages.length === 0 ? (
                    <div className="chat-welcome">
                      <div className="welcome-icon">🕵️</div>
                      <h3>KSP Investigation Copilot</h3>
                      <p>Ask questions regarding witness statements, forensic results, or legal admissibility based on your active case workspace files.</p>
                      
                      <div className="prompt-suggestions">
                        <h4>Try asking:</h4>
                        <button className="suggestion-chip" onClick={() => handleSuggestQuery('Summarize this case')}>"Summarize this case"</button>
                        <button className="suggestion-chip" onClick={() => handleSuggestQuery('What evidence exists?')}>"What evidence exists?"</button>
                        <button className="suggestion-chip" onClick={() => handleSuggestQuery('What witnesses mention the suspect?')}>"What witnesses mention the suspect?"</button>
                        <button className="suggestion-chip" onClick={() => handleSuggestQuery('Show relevant judgments')}>"Show relevant judgments"</button>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} className={`chat-bubble-row ${msg.username === user.username ? 'user' : 'copilot'}`}>
                        <div className="chat-avatar">{msg.username === user.username ? 'U' : '🤖'}</div>
                        <div className="chat-bubble-content">
                          <div className="bubble-sender">{msg.username === user.username ? 'You' : 'Copilot'}</div>
                          <div className="bubble-text">{msg.message || msg.response}</div>
                          
                          {/* Display sources if available */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="bubble-sources">
                              <span className="source-label">Sources:</span>
                              {msg.sources.map((s, idx) => (
                                <div key={idx} className="source-chip" title={s.snippet}>
                                  📘 {s.document_name} ({s.collection_type.replace('_', ' ')})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {sendingChat && (
                    <div className="chat-bubble-row copilot">
                      <div className="chat-avatar">🤖</div>
                      <div className="chat-bubble-content">
                        <div className="bubble-sender">Copilot</div>
                        <div className="typing-indicator"><span></span><span></span><span></span></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input Footer */}
                <form className="chat-input-bar" onSubmit={handleSendChat}>
                  <input
                    type="text"
                    className="form-input chat-input"
                    placeholder={selectedCaseId ? "Ask a question about the case documents..." : "Please select or create a Case Workspace first"}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    disabled={!selectedCaseId || sendingChat}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!selectedCaseId || sendingChat || !chatInput.trim()}>Send</button>
                </form>
              </div>
            )}

            {/* TAB 2: Case Summary */}
            {activeTab === 'summary' && (
              <div className="summary-tab-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>Cached Case Summary</h3>
                  <button className="btn btn-secondary btn-sm" onClick={generateSummary} disabled={loadingSummary}>
                    {loadingSummary ? 'Regenerating...' : '🔄 Regenerate Summary'}
                  </button>
                </div>

                {loadingSummary ? (
                  <div className="loading-small">Processing document chunks and updating summaries...</div>
                ) : summary ? (
                  <div className="summary-card-body">
                    <div className="summary-block">
                      <h4>📌 Case Overview</h4>
                      <p>{summary.overview}</p>
                    </div>

                    <div className="summary-grid">
                      <div className="summary-block">
                        <h4>👥 Individuals Involved</h4>
                        <ul>
                          {summary.individuals?.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>

                      <div className="summary-block">
                        <h4>⚔️ Key Evidence</h4>
                        <ul>
                          {summary.evidence?.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    </div>

                    <div className="summary-block">
                      <h4>📅 Important Dates</h4>
                      <ul>
                        {summary.dates?.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>

                    <div className="summary-block">
                      <h4>📊 Investigation Status</h4>
                      <span className="badge badge-info">{summary.status}</span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No Case Summary Cache Found</h3>
                    <p>Click "Regenerate Summary" to analyze files and extract insights.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Chronological Timeline */}
            {activeTab === 'timeline' && (
              <div className="timeline-tab-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>Chronological Investigation Timeline</h3>
                  <button className="btn btn-secondary btn-sm" onClick={generateTimeline} disabled={loadingTimeline}>
                    {loadingTimeline ? 'Extracting...' : '🔄 Refresh Timeline'}
                  </button>
                </div>

                {loadingTimeline ? (
                  <div className="loading-small">Scanning dates and parsing chronology...</div>
                ) : timeline.length > 0 ? (
                  <div className="timeline-tree">
                    {timeline.map((evt, idx) => (
                      <div key={idx} className="timeline-node">
                        <div className="timeline-date">{evt.date}</div>
                        <div className="timeline-bubble">
                          <p>{evt.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No Chronological Events Detected</h3>
                    <p>Click "Refresh Timeline" to scan case files for calendar dates and occurrences.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Court Judgment Similarity Search */}
            {activeTab === 'search' && (
              <div className="search-tab-view">
                <h3>🏛️ Legal Database Search</h3>
                <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '15px' }}>
                  Search supreme court judgements and legal codes using local vector embeddings.
                </p>

                <form className="search-input-form" onSubmit={handleSearchJudgments}>
                  <div className="form-row">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Find electronic evidence admissibility or cyber fraud acts..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    <select 
                      className="form-select select-mini"
                      value={searchCollection} 
                      onChange={e => setSearchCollection(e.target.value)}
                    >
                      <option value="judgments">Judgments Only</option>
                      <option value="legal_references">Legal Codes Only</option>
                      <option value="">All Collections</option>
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={searching}>
                      {searching ? 'Vector Searching...' : 'Search'}
                    </button>
                  </div>
                </form>

                <div className="search-results-list" style={{ marginTop: '20px' }}>
                  {searching ? (
                    <div className="loading-small">Querying vector indexing space...</div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((res, i) => (
                      <div key={i} className="search-result-card">
                        <div className="res-header">
                          <h4>📘 {res.document_name}</h4>
                          <span className="badge badge-warning">Similarity: {(res.similarity * 100).toFixed(1)}%</span>
                        </div>
                        <p className="res-text">"...{res.text}..."</p>
                        <span className="res-type">Category: {res.collection_type.replace('_', ' ').toUpperCase()}</span>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <h3>Search Court Judgments</h3>
                      <p>Enter a query above to retrieve relevant legal cases and code chunks.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: Prediction Explainer */}
            {activeTab === 'explainer' && (
              <div className="explainer-tab-view">
                <h3>🔮 ML Risk & Hotspot Explanation Module</h3>
                <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '15px' }}>
                  Communicate with the PredictionService abstraction and query plain-language explanations behind organizer-provided predictions.
                </p>

                <form className="explainer-input-form" onSubmit={handleExplainPrediction}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">District/Location</label>
                      <select 
                        className="form-select"
                        value={selectedDistrict}
                        onChange={e => setSelectedDistrict(e.target.value)}
                      >
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Predicted Crime Head</label>
                      <select 
                        className="form-select"
                        value={selectedCrimeType}
                        onChange={e => setSelectedCrimeType(e.target.value)}
                      >
                        {crimeTypes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    
                    <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button className="btn btn-primary" type="submit" style={{ width: '100%', height: '36px' }} disabled={explaining}>
                        {explaining ? 'Querying ML Model...' : 'Explain Risk'}
                      </button>
                    </div>
                  </div>
                </form>

                {explaining ? (
                  <div className="loading-small">Communicating with PredictionService models...</div>
                ) : explanation ? (
                  <div className="explanation-display-card" style={{ marginTop: '20px' }}>
                    <div className="exp-score-header">
                      <div className="exp-metric">
                        <div className="exp-val" style={{ color: explanation.riskScore >= 0.7 ? '#ef4444' : '#f59e0b' }}>
                          {(explanation.riskScore * 100).toFixed(0)}%
                        </div>
                        <div className="exp-lbl">Risk Score</div>
                      </div>

                      <div className="exp-metric">
                        <div className="exp-val" style={{ color: '#06b6d4' }}>
                          {(explanation.confidenceScore * 100).toFixed(0)}%
                        </div>
                        <div className="exp-lbl">Model Confidence</div>
                      </div>

                      <div className="exp-metric">
                        <div className="exp-val" style={{ color: '#10b981' }}>
                          {explanation.riskLevel}
                        </div>
                        <div className="exp-lbl">Hotspot Danger Class</div>
                      </div>
                    </div>

                    <div className="exp-factors-block">
                      <h4>📊 Analysis Summary</h4>
                      <p className="plain-lang-summary">{explanation.plainLanguage}</p>
                      
                      <h4 style={{ marginTop: '15px' }}>🔍 Detailed Risk Factors</h4>
                      <ul className="factors-bullets">
                        {explanation.factors.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>ML Explainer Panel</h3>
                    <p>Select a location and crime head above to query the predictions explanation engine.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* MODAL 1: Create Case Workspace */}
      {showCreateCase && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create Case Workspace</h3>
            <form onSubmit={handleCreateCase} style={{ marginTop: '15px' }}>
              <div className="form-group">
                <label className="form-label">Case ID / Reference Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. KSP-CYBER-2026-003"
                  value={newCaseId}
                  onChange={e => setNewCaseId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Case Name / Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Brigade Road Phishing Network"
                  value={newCaseName}
                  onChange={e => setNewCaseName(e.target.value)}
                  required
                />
              </div>

              <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowCreateCase(false)}>Cancel</button>
                <button className="btn btn-primary" type="submit">Create Workspace</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Upload Case Document */}
      {showUploadDoc && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '560px' }}>
            <h3>Upload Case Document</h3>
            <form onSubmit={handleUploadDocument} style={{ marginTop: '15px' }}>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <div className="form-group">
                  <label className="form-label font-bold">Select File (.txt only)</label>
                  <input
                    type="file"
                    className="form-input"
                    accept=".txt"
                    onChange={handleFileChange}
                    style={{ padding: '6px' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Document Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Witness_Statement_01.txt"
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Classification / Doc Type</label>
                  <select
                    className="form-select"
                    value={newDocType}
                    onChange={e => setNewDocType(e.target.value)}
                  >
                    <option value="FIR">FIR</option>
                    <option value="Witness Statement">Witness Statement</option>
                    <option value="Charge Sheet">Charge Sheet</option>
                    <option value="Investigation Notes">Investigation Notes</option>
                    <option value="Forensic Report">Forensic Report</option>
                    <option value="Court Judgment">Court Judgment</option>
                    <option value="Legal Reference Code">Legal Reference Code</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Collection Target</label>
                  <select
                    className="form-select"
                    value={newDocCollection}
                    onChange={e => setNewDocCollection(e.target.value)}
                  >
                    <option value="case_files">Case Files (Private)</option>
                    <option value="judgments">Judgments (Global)</option>
                    <option value="legal_references">Legal References (Global)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">File Content (Paste or load from file)</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '180px', fontFamily: 'var(--font-mono)', fontSize: '11px', resize: 'vertical' }}
                  placeholder="Paste raw text contents here..."
                  value={newDocContent}
                  onChange={e => setNewDocContent(e.target.value)}
                  required
                />
              </div>

              <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowUploadDoc(false)}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={uploadingDoc}>
                  {uploadingDoc ? 'Processing...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
