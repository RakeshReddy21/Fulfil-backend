const express = require('express');
const Webhook = require('../models/Webhook');
const auth = require('../middleware/auth');
const { testWebhook } = require('../utils/webhookTrigger');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const webhooks = await Webhook.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
    res.json(webhooks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const webhook = await Webhook.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    res.json(webhook);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { url, eventType, enabled, secret } = req.body;

    const webhook = new Webhook({
      url,
      eventType: eventType || 'product.created',
      enabled: enabled !== undefined ? enabled : true,
      secret: secret || '',
      createdBy: req.user._id
    });

    await webhook.save();
    res.status(201).json(webhook);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { url, eventType, enabled, secret } = req.body;

    const webhook = await Webhook.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    if (url) webhook.url = url;
    if (eventType) webhook.eventType = eventType;
    if (enabled !== undefined) webhook.enabled = enabled;
    if (secret !== undefined) webhook.secret = secret;

    await webhook.save();
    res.json(webhook);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const webhook = await Webhook.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/test', auth, async (req, res) => {
  try {
    const result = await testWebhook(req.params.id, req.user._id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;


