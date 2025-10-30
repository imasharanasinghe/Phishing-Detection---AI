#!/usr/bin/env python3
"""
MongoDB Connection Test Script
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
    mongo_uri = f"mongodb+srv://{username}:{password}@{cluster_url}.mongodb.net/phishing_ai?retryWrites=true&w=majority&appName=phishing-detection01"
    
    print("Testing MongoDB Atlas connection...")
    print(f"Connection string: {mongo_uri}")
    print()
    
    try:
        # Create client
        client = AsyncIOMotorClient(mongo_uri)
        
        # Test connection
        await client.admin.command('ping')
        print("SUCCESS: MongoDB Atlas connection successful!")
        print("Your database is ready to use!")
        
        # Test database access
        db = client.phishing_ai
        collections = await db.list_collection_names()
        print(f"Database 'phishing_ai' has {len(collections)} collections")
        
        return True
        
    except Exception as e:
        print(f"ERROR: MongoDB Atlas connection failed: {e}")
        print()
        print("Troubleshooting steps:")
        print("1. Check your cluster URL in MongoDB Atlas")
        print("2. Make sure your IP is whitelisted")
        print("3. Verify username and password are correct")
        print("4. Ensure the cluster is running")
        return False
    
    finally:
        client.close()

if __name__ == "__main__":
    print("Phishing Detection AI - MongoDB Connection Test")
    print("=" * 50)
    print()
    
    # Run the test
    asyncio.run(test_mongodb_connection())
