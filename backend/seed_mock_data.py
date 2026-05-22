import asyncio
import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# Import models from the server
from server import Base, ComplaintTable, CustomerTable, StatusHistoryTable, CounterTable

async def seed():
    load_dotenv('.env')
    
    pg_url = os.environ.get('SUPABASE_DB_URL')
    if not pg_url:
        print("SUPABASE_DB_URL is not set in .env")
        return
        
    print(f"Connecting to Postgres at {pg_url}")
    engine = create_async_engine(pg_url, echo=False)
    
    AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc).isoformat()
        today = datetime.now(timezone.utc).date().isoformat()
        
        # Ensure counter exists and get seq
        result = await session.execute(select(CounterTable).filter_by(id="complaint_global"))
        counter = result.scalar_one_or_none()
        if not counter:
            counter = CounterTable(id="complaint_global", seq=100)
            session.add(counter)
            await session.flush()
            
        # Sample Data
        mock_data = [
            {
                "name": "Amit Sharma",
                "phone": "+919876543210",
                "address": "123 Main St, Near Plaza",
                "city": "Mumbai",
                "state": "Maharashtra",
                "product_serial": "SN-998877",
                "issue_description": "Device is not turning on after power outage.",
                "status": "Pending"
            },
            {
                "name": "Priya Singh",
                "phone": "+918877665544",
                "address": "Flat 4B, Green Valley Apts",
                "city": "Delhi",
                "state": "Delhi",
                "product_serial": "SN-112233",
                "issue_description": "Display is flickering occasionally.",
                "status": "In Progress"
            }
        ]
        
        for data in mock_data:
            # Upsert Customer
            exists = await session.execute(select(CustomerTable).filter_by(phone=data['phone']))
            cust = exists.scalar_one_or_none()
            if not cust:
                cust = CustomerTable(
                    phone=data['phone'],
                    name=data['name'],
                    address=data['address'],
                    city=data['city'],
                    state=data['state'],
                    created_at=now,
                    updated_at=now
                )
                session.add(cust)
                
            # Generate Complaint ID
            counter.seq += 1
            seq = counter.seq
            cid = f"{datetime.now(timezone.utc).month}{datetime.now(timezone.utc).year}{seq:04d}"
            
            # Create Complaint
            comp = ComplaintTable(
                id=str(uuid.uuid4()),
                complaint_id=cid,
                phone=data['phone'],
                name=data['name'],
                address=data['address'],
                city=data['city'],
                state=data['state'],
                product_serial=data['product_serial'],
                issue_description=data['issue_description'],
                date=today,
                status=data['status'],
                created_at=now,
                updated_at=now
            )
            session.add(comp)
            
            # Add History
            hist = StatusHistoryTable(
                complaint_id=cid,
                status=data['status'],
                note="Mock complaint seeded.",
                at=now
            )
            session.add(hist)
            
            print(f"Created Complaint: {cid} for {data['name']}")
            
        await session.commit()
        print("Successfully seeded mock complaints!")

if __name__ == "__main__":
    asyncio.run(seed())
