@ SustainOCPM

Carbon-Aware Object-Centric Process Mining Platform

@ Overview

SustainOCPM is a sustainability-focused Object-Centric Process Mining (OCPM) platform that combines process mining, carbon accounting, supplier intelligence, and ESG reporting into a unified analytics environment.

The system analyzes supply-chain event logs and automatically detects:

- Carbon Violations
- Process Violations
- Data Quality Issues
- Supplier ESG Risks
- Conformance Deviations
- Carbon Budget Breaches

It also generates Business Responsibility and Sustainability Reporting (BRSR) evidence and carbon-aware conformance metrics.



@ Key Features

### Executive Cockpit
- ESG KPIs
- Carbon emissions overview
- Supplier performance analytics
- Compliance monitoring

@ Process Explorer
- Event log analysis
- Variant exploration
- Process visualization

@ Transport Emissions
- Scope-3 logistics emissions
- Freight mode analysis
- Carbon hotspots

@ Supplier Intelligence
- Supplier ESG ratings
- Carbon intensity monitoring
- Risk classification

@ Violations Explorer
- Carbon Violations
- Process Violations
- Data Quality Issues

@ Carbon Budget Engine
- Activity-level budgets
- Order-level budgets
- Compliance scoring

@ Conformance Checker
- Traditional process conformance
- Carbon-aware conformance
- Dual-objective fitness scoring

@ BRSR Report Generator
- Automated ESG disclosures
- Carbon accounting evidence
- Sustainability reporting exports



@ Technology Stack

Frontend:
- React
- Vite
- Chart.js
- Axios

Backend:
- FastAPI
- Pandas
- Python

Analytics:
- Object-Centric Process Mining
- Carbon Attribution Engine
- Sustainability Conformance Checking



@ Input Data Format

Upload a CSV event log through the Event Logs page.

Required columns:

| Column | Description |
|----------|-------------|
| event_id | Unique event identifier |
| order_id | Supply chain order identifier |
| supplier_id | Supplier identifier |
| activity | Process activity |
| timestamp | Event timestamp |
| carbon_factor | Carbon intensity factor |
| carbon_budget | Allowed carbon budget |
| supplier_rating | ESG rating (A-E) |
| transport_type | Air Freight / Sea Freight / Road Freight |
| violation_type | Carbon / Process / Data |

Example:

event_id,order_id,supplier_id,activity,timestamp,carbon_factor,carbon_budget,supplier_rating,transport_type,violation_type

E0000001,O00001,S034,Create Order,2025-06-13 05:12:00,0.84,300,A,None,NONE

E0000002,O00001,S034,Freight Booking,2025-06-14 05:12:00,2.50,300,A,Road Freight,NONE

E0000003,O00001,S034,Delivery,2025-06-15 05:12:00,1.20,300,A,Road Freight,NONE



 @ Running the Project

### Backend

bash cd backend  
python -m venv .venv  s
ource .venv/bin/activate  
pip install -r requirements.txt  
uvicorn main:app --reload 

Backend URL:

http://localhost:8000

@ Frontend

bash cd dashboard  
npm install  
npm run dev 

Frontend URL:

http://localhost:5173



@ Sample Data

Sample datasets are available in:

sample_data/

- events_10k.csv
- events_25k.csv

These files can be uploaded directly into SustainOCPM for testing.



@ Research Contribution

The project introduces Carbon-Aware Conformance Checking:

Traditional Process Mining:

Fitness = Sequence Conformance

Carbon-Aware Process Mining:

Fitness = 0.5 × Sequence Fitness + 0.5 × Carbon Fitness

This enables sustainability violations to be detected even when a process appears structurally compliant.



@ Authors

Rudra Pratap Singh ,

Swastik Vyas

Manipal University Jaipur

B.Tech Information Technology
