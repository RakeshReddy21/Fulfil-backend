const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

productSchema.index({ sku: 1 }, { 
  unique: true,
  collation: { locale: 'en', strength: 2 }
});

productSchema.index({ name: 'text', description: 'text', sku: 'text' });
productSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);


