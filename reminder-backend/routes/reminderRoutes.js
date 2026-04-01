const router = require('express').Router();
const ctrl   = require('../controllers/reminderController');
const groq   = require('../services/groqService');
const auth   = require('../middleware/authMiddleware');

router.use(auth);

router.post('/create',                 ctrl.createReminder);
router.post('/list/:user_id',          ctrl.listReminders);
router.get('/all/:user_id',            ctrl.getAllReminders);
router.post('/check-conflict',         ctrl.checkConflict);
router.get('/suggested-time/:user_id', ctrl.getSuggestedTime);
router.get('/digest/:user_id',         ctrl.getWeeklyDigest);
router.post('/location-check',         ctrl.checkLocationReminders);
router.post('/find-similar',          ctrl.findSimilar);

router.post('/parse', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'text required' });

    const parsed = await groq.processSmartReminder(text);
    if (!parsed) return res.status(422).json({ message: 'Could not parse reminder' });

    // ── Validation: detect missing / low-confidence fields ──
    const isNull  = (v) => !v || v === 'null' || v === 'undefined';
    const hasTask = !isNull(parsed.task) && parsed.task.toString().trim().length > 2;
    const hasTime = !isNull(parsed.time);
    const hasDate = !isNull(parsed.date);
    const conf    = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;
    const lowConf = conf < 0.6;

    // Detect ambiguous / filler words that suggest unclear speech
    const ambiguousWords = ['something', 'someday', 'later', 'soon', 'whenever', 'maybe', 'perhaps'];
    const isAmbiguous = ambiguousWords.some(w =>
      (parsed.task || '').toLowerCase().includes(w)
    );

    // Clarification triggers
    const missingTask = !hasTask;
    const missingTime = !hasTime;
    const missingDateForOnce = parsed.type === 'ONCE' && !hasDate;
    const needsClarification = missingTask || missingTime || missingDateForOnce || lowConf || isAmbiguous;

    // Build a specific clarification message
    let clarificationMessage = 'Can you please repeat or confirm?';
    if (missingTask) {
      clarificationMessage = "I didn't catch what you want to be reminded about. Can you say it again?";
    } else if (missingTime) {
      clarificationMessage = `Got it — "${parsed.task}". What time should I remind you?`;
    } else if (missingDateForOnce) {
      clarificationMessage = `Got it — "${parsed.task}" at ${parsed.time}. Which date?`;
    } else if (isAmbiguous) {
      clarificationMessage = `The reminder seems a bit unclear. Can you be more specific?`;
    } else if (lowConf) {
      clarificationMessage = "I'm not fully sure I understood. Can you repeat that clearly?";
    }

    return res.json({
      ...parsed,
      confidence: conf,
      needs_clarification: needsClarification,
      clarification_message: needsClarification ? clarificationMessage : null,
    });
  } catch (err) {
    console.error('parse error:', err.message);
    res.status(500).json({ message: 'Parse failed' });
  }
});

router.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) return res.status(400).json({ message: 'audioBase64 required' });

    const fs   = require('fs');
    const path = require('path');
    // .m4a — frontend records in AAC/MPEG4 format, Whisper supports this natively
    const tmpFilePath = path.join(__dirname, '..', `tmp_audio_${Date.now()}.m4a`);

    fs.writeFileSync(tmpFilePath, Buffer.from(audioBase64, 'base64'));

    try {
      const rawText   = await groq.transcribeAudio(tmpFilePath);
      const cleanText = await groq.cleanTranscription(rawText);
      fs.unlinkSync(tmpFilePath);
      console.log(`[transcribe] raw: "${rawText}" → clean: "${cleanText}"`);
      return res.json({ text: cleanText, raw: rawText });
    } catch (apiErr) {
      if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
      throw apiErr;
    }
  } catch (err) {
    console.error('transcribe error:', err.message);
    res.status(500).json({ message: 'Transcription failed', error: err.message });
  }
});

router.post('/parse-filter', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'text required' });
    const parsed = await groq.parseFilterText(text);
    if (!parsed) return res.status(422).json({ message: 'Could not parse filter' });
    res.json(parsed);
  } catch (err) {
    console.error('parse-filter error:', err.message);
    res.status(500).json({ message: 'Parse failed' });
  }
});

router.post('/intent', async (req, res) => {
  try {
    const { text, chatHistory } = req.body;
    if (!text) return res.status(400).json({ message: 'text required' });
    const intentData = await groq.getIntent(text, chatHistory);
    res.json(intentData);
  } catch (err) {
    console.error('intent error:', err.message);
    res.status(500).json({ message: 'Intent processing failed' });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { prompt, asJson } = req.body;
    if (!prompt) return res.status(400).json({ message: 'prompt required' });
    const response = asJson ? await groq.askJSON(prompt) : await groq.ask(prompt);
    res.json(asJson ? response : { response });
  } catch (err) {
    console.error('ask error:', err.message);
    res.status(500).json({ message: 'Ask failed' });
  }
});

router.get('/:id',    ctrl.getReminder);
router.put('/:id',    ctrl.updateReminder);
router.delete('/:id', ctrl.deleteReminder);

module.exports = router;
