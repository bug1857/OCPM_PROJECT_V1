from pathlib import Path

import pandas as pd
import pickle

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import LabelEncoder

# --------------------------------------------------
# Load Data
# --------------------------------------------------

events = pd.read_csv('data/transactions/events.csv')
cases = pd.read_csv('data/output/case_summary.csv')

# --------------------------------------------------
# Supplier rating encoding
# --------------------------------------------------

rating_encoder = LabelEncoder()
events['supplier_rating'] = rating_encoder.fit_transform(
    events['supplier_rating'].astype(str)
)

# --------------------------------------------------
# Order-level feature engineering
# --------------------------------------------------

features = events.groupby('order_id').agg(
    total_carbon_factor=('carbon_factor', 'sum'),
    avg_carbon_factor=('carbon_factor', 'mean'),
    max_carbon_factor=('carbon_factor', 'max'),
    supplier_rating=('supplier_rating', 'mean'),
    event_count=('event_id', 'count')
).reset_index()

# transport indicators
na_fill = events['transport_type'].fillna('NONE')
events['is_air'] = (na_fill == 'Air Freight').astype(int)
events['is_road'] = (na_fill == 'Road Freight').astype(int)
events['is_sea'] = (na_fill == 'Sea Freight').astype(int)

transport = events.groupby('order_id').agg(
    contains_air=('is_air', 'max'),
    contains_road=('is_road', 'max'),
    contains_sea=('is_sea', 'max')
).reset_index()

features = features.merge(
    transport,
    on='order_id',
    how='left'
)

# --------------------------------------------------
# Labels
# --------------------------------------------------

labels = cases[['order_id', 'compliance']].copy()
labels['target'] = labels['compliance'].map({
    'PASS': 0,
    'FAIL': 1
})

# --------------------------------------------------
# Training dataset
# --------------------------------------------------

df = features.merge(
    labels[['order_id', 'target']],
    on='order_id',
    how='inner'
)

print('\nTRAINING WITHOUT BUDGET FEATURES')
print('-' * 40)

X = df.drop(columns=['order_id', 'target'])
y = df['target']

# --------------------------------------------------
# Split
# --------------------------------------------------

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# --------------------------------------------------
# Model
# --------------------------------------------------

model = RandomForestClassifier(
    n_estimators=300,
    max_depth=12,
    random_state=42
)

model.fit(X_train, y_train)

# --------------------------------------------------
# Evaluation
# --------------------------------------------------

pred = model.predict(X_test)
prob = model.predict_proba(X_test)[:, 1]

print('\nMODEL EVALUATION')
print('-' * 40)
print(f'Accuracy  : {accuracy_score(y_test, pred):.4f}')
print(f'Precision : {precision_score(y_test, pred):.4f}')
print(f'Recall    : {recall_score(y_test, pred):.4f}')
print(f'F1 Score  : {f1_score(y_test, pred):.4f}')
print(f'Avg Risk Probability : {prob.mean():.4f}')

print('\nFEATURE IMPORTANCE')
print('-' * 40)
for feature, importance in sorted(
    zip(X.columns, model.feature_importances_),
    key=lambda x: x[1],
    reverse=True
):
    print(f'{feature:<25} {importance:.4f}')

# --------------------------------------------------
# Save Model
# --------------------------------------------------

with open('backend/risk_model.pkl', 'wb') as f:
    pickle.dump(model, f)

print('\nModel saved: backend/risk_model.pkl')