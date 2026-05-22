import requests

BASE_URL = "http://localhost:8000/api"

def run_test():
    login_data = {
        "email": "admin@company.com",
        "password": "Admin@123"
    }
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    token = resp.json().get("access_token")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print("Updating status for complaint 520260087 to 'In Progress'")
    resp = requests.patch(
        f"{BASE_URL}/complaints/520260087/status", 
        json={"status": "In Progress", "note": "Testing update"},
        headers=headers
    )
    
    print("Status Code:", resp.status_code)
    print("Response:", resp.text)

if __name__ == "__main__":
    run_test()
