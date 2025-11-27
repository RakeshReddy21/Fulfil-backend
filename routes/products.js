const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { processCSVImport } = require('../utils/csvProcessor');
const { triggerWebhooks } = require('../utils/webhookTrigger');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/csv');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'csv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const job = await processCSVImport(req.file.path, req.user._id);
    
    if (job.id && job.id.startsWith('sync-')) {
      return res.status(200).json({
        message: 'CSV import completed',
        jobId: job.id,
        filename: req.file.originalname,
        result: job.returnvalue
      });
    }

    res.status(202).json({
      message: 'CSV upload started',
      jobId: job.id,
      filename: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { createdBy: req.user._id };
    
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }
    
    if (req.query.sku) {
      const escapedSku = req.query.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.sku = { $regex: escapedSku, $options: 'i' };
    }
    
    if (req.query.active !== undefined) {
      filter.active = req.query.active === 'true';
    }

    let query = Product.find(filter);
    
    if (req.query.search) {
      query = query.sort({ score: { $meta: 'textScore' } });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const products = await query.skip(skip).limit(limit);
    const total = await Product.countDocuments(filter);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { sku, name, description, active } = req.body;

    const escapedSku = sku.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingProduct = await Product.findOne({
      sku: { $regex: new RegExp(`^${escapedSku}$`, 'i') },
      createdBy: req.user._id
    });

    if (existingProduct) {
      return res.status(400).json({ message: 'Product with this SKU already exists' });
    }

    const product = new Product({
      sku: sku.trim(),
      name,
      description: description || '',
      active: active !== undefined ? active : true,
      createdBy: req.user._id
    });

    await product.save();

    await triggerWebhooks('product.created', product, req.user._id);

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product with this SKU already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { sku, name, description, active } = req.body;

    const product = await Product.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (sku && sku.toLowerCase() !== product.sku.toLowerCase()) {
      const escapedSku = sku.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existingProduct = await Product.findOne({
        sku: { $regex: new RegExp(`^${escapedSku}$`, 'i') },
        createdBy: req.user._id,
        _id: { $ne: req.params.id }
      });

      if (existingProduct) {
        return res.status(400).json({ message: 'Product with this SKU already exists' });
      }
    }

    product.sku = sku || product.sku;
    product.name = name || product.name;
    product.description = description !== undefined ? description : product.description;
    product.active = active !== undefined ? active : product.active;

    await product.save();

    await triggerWebhooks('product.updated', product, req.user._id);

    res.json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product with this SKU already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await triggerWebhooks('product.deleted', product, req.user._id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/bulk/all', auth, async (req, res) => {
  try {
    const result = await Product.deleteMany({ createdBy: req.user._id });

    res.json({
      message: 'All products deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;


