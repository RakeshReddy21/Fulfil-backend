const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  eventType: {
    type: String,
    required: true,
    enum: ['product.created', 'product.updated', 'product.deleted', 'product.bulk_import', 'document.uploaded'],
    default: 'product.created'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  secret: {
    type: String,
    default: ''
  },
  lastTriggered: {
    type: Date
  },
  lastResponseCode: {
    type: Number
  },
  lastResponseTime: {
    type: Number
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Webhook', webhookSchema);


