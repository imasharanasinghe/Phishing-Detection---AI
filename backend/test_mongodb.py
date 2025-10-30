#!/usr/bin/env python3
"""
MongoDB Connection Test Script
This script will help you test your MongoDB Atlas connection
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_mongodb_connection():
    """Test MongoDB Atlas connection with your credentials"""
    
    # Your MongoDB credentials
    username = "wijesinghesachithra_db_user"
    password = "m1voiRa2Fokbg9yd"
    
    # Your actual cluster URL
    cluster_url = "phishing-detection01.io6hcx8"
    
    # Construct the connection string
    mongo_uri = f"mongodb+srv://{username}:{password}@{cluster_url}.mongodb.net/phishing_detection?retryWrites=true&w=majority"
    
    print("🔍 Testing MongoDB Atlas connection...")
    print(f"📡 Connection string: {mongo_uri}")
    print()
    
    try:
        # Create client
        client = AsyncIOMotorClient(mongo_uri)
        
        # Test connection
        await client.admin.command('ping')
        print("✅ MongoDB Atlas connection successful!")
        print("🎉 Your database is ready to use!")
        
        # Test database access
        db = client.phishing_detection
        collections = await db.list_collection_names()
        print(f"📊 Database 'phishing_detection' has {len(collections)} collections")
        
        return True
        
    except Exception as e:
        print(f"❌ MongoDB Atlas connection failed: {e}")
        print()
        print("🔧 Troubleshooting steps:")
        print("1. Check your cluster URL in MongoDB Atlas")
        print("2. Make sure your IP is whitelisted")
        print("3. Verify username and password are correct")
        print("4. Ensure the cluster is running")
        return False
    
    finally:
        client.close()

if __name__ == "__main__":
    print("🛡️  Phishing Detection AI - MongoDB Connection Test")
    print("=" * 50)
    print()
    print("📋 Instructions:")
    print("1. Go to MongoDB Atlas: https://cloud.mongodb.com/")
    print("2. Click 'Connect' on your cluster")
    print("3. Choose 'Connect your application'")
    print("4. Copy the connection string")
    print("5. Replace 'cluster0.xxxxx' in this script with your actual cluster URL")
    print()
    
    # Run the test
    asyncio.run(test_mongodb_connection())
