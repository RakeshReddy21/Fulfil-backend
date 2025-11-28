# Render Deployment Guide

This guide will help you deploy the Fulfil backend to Render.

## Prerequisites

- A Render account
- A MongoDB database (MongoDB Atlas recommended)
- (Optional) A Redis instance for async queue processing

## Deployment Steps

### 1. Set Up MongoDB

1. Create a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster
3. Create a database user
4. Whitelist IP addresses:
   - For Render: Add `0.0.0.0/0` to allow all IPs (or add Render's specific IPs)
5. Get your connection string (MongoDB URI)

### 2. Deploy to Render

1. Go to your Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: Your service name
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` (or `npm run dev` for development)
   - **Plan**: Choose your plan

### 3. Set Environment Variables

**CRITICAL**: You must set these environment variables in Render Dashboard → Your Service → Environment:

#### Required Variables:

1. **MONGODB_URI**
   - Your MongoDB connection string
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`
   - Example: `mongodb+srv://myuser:mypass@cluster0.xxxxx.mongodb.net/fulfil?retryWrites=true&w=majority`

2. **JWT_SECRET**
   - A strong random string for signing JWT tokens
   - Generate one using: `openssl rand -base64 32`
   - Or use any strong random string (at least 32 characters recommended)
   - Example: `my-super-secret-jwt-key-change-this-in-production`

#### Optional Variables:

3. **REDIS_HOST** (Optional)
   - Redis hostname (defaults to `localhost`)
   - Only needed if using Redis for async queue processing
   - If using Render Redis: Use the internal Redis hostname

4. **REDIS_PORT** (Optional)
   - Redis port (defaults to `6379`)

5. **REDIS_PASSWORD** (Optional)
   - Redis password if required

**Note**: `PORT` is automatically set by Render, so you don't need to configure it.

### 4. Verify Deployment

After setting the environment variables, Render will automatically redeploy. Check the logs to verify:

1. ✅ MongoDB Connected Successfully
2. 🚀 Server running on port [PORT]

### 5. Test the Deployment

Visit your Render service URL:
- Health check: `https://your-service.onrender.com/api/health`
- Root endpoint: `https://your-service.onrender.com/`

## Troubleshooting

### "Missing required environment variables" Error

**Problem**: The server crashes with "Missing required environment variables: JWT_SECRET"

**Solution**: 
1. Go to Render Dashboard → Your Service → Environment
2. Add `JWT_SECRET` with a strong random value
3. Add `MONGODB_URI` with your MongoDB connection string
4. Save and wait for automatic redeploy

### "No open ports detected" Error

**Problem**: Render can't detect an open port

**Solution**: This usually happens because:
1. The server crashed before starting (check for missing env vars)
2. The server is not binding to `process.env.PORT`
3. Check the logs for the actual error

The server should automatically use `process.env.PORT` which Render sets. If you see this error, check the logs for the root cause (usually missing environment variables).

### MongoDB Connection Errors

**Problem**: "MongoDB Connection Error"

**Solutions**:
1. Verify `MONGODB_URI` is set correctly in Render environment variables
2. Check MongoDB Atlas IP whitelist includes `0.0.0.0/0` (all IPs)
3. Verify MongoDB cluster is running
4. Check database username and password are correct

### Redis Warnings

**Problem**: "⚠️ Redis not available. CSV imports will be processed synchronously."

**Solution**: This is a warning, not an error. The app will work without Redis, but CSV imports will be processed synchronously. To enable async processing:
1. Set up a Redis instance (Render offers Redis as a service)
2. Set `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` environment variables

## Environment Variables Summary

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string | - |
| `JWT_SECRET` | ✅ Yes | Secret for JWT token signing | - |
| `PORT` | ❌ No | Server port (auto-set by Render) | 5000 |
| `REDIS_HOST` | ❌ No | Redis hostname | localhost |
| `REDIS_PORT` | ❌ No | Redis port | 6379 |
| `REDIS_PASSWORD` | ❌ No | Redis password | - |

## Support

If you encounter issues:
1. Check Render logs for detailed error messages
2. Verify all required environment variables are set
3. Ensure MongoDB Atlas IP whitelist is configured correctly
4. Check that your MongoDB cluster is running and accessible

