const fs = require('fs');
const csv = require('csv-parser');
const Product = require('../models/Product');
const { addCSVImportJob } = require('./queue');

async function processCSVImport(filePath, userId) {
  const job = await addCSVImportJob(filePath, userId);
  return job.id;
}

async function processCSVFile(filePath, userId, progressCallback) {
  const products = [];
  let processed = 0;
  let errors = [];

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
      .pipe(csv({
        skipEmptyLines: true,
        skipLinesWithError: false
      }))
      .on('data', async (row) => {
        try {
          const sku = (row.sku || row.SKU || '').trim();
          const name = (row.name || row.Name || '').trim();
          const description = (row.description || row.Description || '').trim();
          const active = row.active !== undefined ? row.active === 'true' || row.active === true : true;

          if (!sku) {
            errors.push({ row: processed + 1, error: 'SKU is required' });
            return;
          }

          const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          await Product.findOneAndUpdate(
            {
              sku: { $regex: new RegExp(`^${escapedSku}$`, 'i') },
              createdBy: userId
            },
            {
              sku: sku,
              name: name,
              description: description,
              active: active,
              createdBy: userId
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true
            }
          );

          processed++;
          products.push({ sku, name });

          if (processed % 100 === 0 && progressCallback) {
            progressCallback(processed);
          }
        } catch (error) {
          errors.push({ row: processed + 1, error: error.message });
        }
      })
      .on('end', async () => {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('Error deleting CSV file:', err);
        }

        resolve({
          total: processed,
          imported: products.length,
          errors: errors.length,
          errorDetails: errors
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

module.exports = {
  processCSVImport,
  processCSVFile
};


