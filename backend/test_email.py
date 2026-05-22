import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def run_test():
    print("1. Logging in as admin...")
    login_data = {
        "email": "admin@company.com",
        "password": "Admin@123"
    }
    
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        return
        
    token = resp.json().get("access_token")
    print("Login successful! Got token.")
    
    print("\n2. Registering complaint for Pankaj...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    complaint_data = {
        "name": "Pankaj",
        "email": "pankajsaar1414@gmail.com",
        "phone": "+919988776655",
        "address": "123 Random Street, Apt 4B",
        "city": "Mumbai",
        "state": "Maharashtra",
        "product_serial": "SN-XYZ-12345",
        "issue_description": "The device is overheating and shutting down randomly.",
        "warranty": "Warranted"
    }
    
    resp = requests.post(f"{BASE_URL}/complaints", json=complaint_data, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to create complaint: {resp.text}")
        return
        
    result = resp.json()
    print("Complaint created successfully!")
    print(f"Complaint ID: {result.get('complaint_id')}")
    print("\nNotification Status:")
    print(json.dumps(result.get("email_status"), indent=2))
    print(json.dumps(result.get("sms_status"), indent=2))

if __name__ == "__main__":
    run_test()
