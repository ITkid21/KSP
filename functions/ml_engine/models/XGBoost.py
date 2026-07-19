import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, precision_score, recall_score, 
                             f1_score, confusion_matrix, classification_report)
from sklearn.preprocessing import LabelEncoder
import shap
import joblib
import logging
import os
import re
from datetime import datetime

# Prevent GUI popups for matplotlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CrimeRiskPredictor:
    def __init__(self, data_path: str = "XGBOOST_dataset1.csv"):
        self.data_path = data_path
        self.model = None
        self.feature_cols = None
        self.label_encoders = {}

    def load_data(self) -> pd.DataFrame:
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Dataset not found at: {self.data_path}")
        df = pd.read_csv(self.data_path)
        logger.info(f"Loaded {len(df)} records from {self.data_path}")
        return df

    # Column mapping from crime_review.csv to expected schema
    COLUMN_MAP = {
        'MAJOR HEAD': 'Crime_type',
        'ACT': 'Full Place of Occurrence',
        'During the current year upto the end of month under review': 'Total Frequency',
        'During the current month': 'Frequency per Month',
    }

    def clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        
        # Strip string values and rename columns to standardize
        df.columns = [col.strip() for col in df.columns]
        
        for col in df.select_dtypes(include='object').columns:
            df[col] = df[col].astype(str).str.strip()

        # Rename columns from crime_review.csv format to expected schema
        df = df.rename(columns=self.COLUMN_MAP)

        def parse_year(year_str):
            if pd.isna(year_str):
                return 2022
            matches = re.findall(r'\d{4}', str(year_str))
            return int(matches[0]) if matches else 2022

        df['Year_numeric'] = df['Year'].apply(parse_year)
        
        df['Total Frequency'] = pd.to_numeric(df['Total Frequency'], errors='coerce').fillna(1)
        df['Frequency per Month'] = pd.to_numeric(df['Frequency per Month'], errors='coerce').fillna(1)
        
        return df

    def create_target(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        
        # If a 'Severity' column already exists, use it directly
        if 'Severity' in df.columns:
            severity_map = {'low': 0, 'medium': 1, 'high': 2}
            df['target'] = df['Severity'].str.lower().map(severity_map)
        else:
            # Derive severity from 'Frequency per Month' using quantile-based binning
            freq = df['Frequency per Month']
            q33 = freq.quantile(0.33)
            q66 = freq.quantile(0.66)
            df['Severity'] = pd.cut(
                freq, bins=[-np.inf, q33, q66, np.inf],
                labels=['low', 'medium', 'high']
            )
            df['target'] = df['Severity'].map({'low': 0, 'medium': 1, 'high': 2})
            logger.info(f"Derived severity thresholds: low <= {q33:.0f}, medium <= {q66:.0f}, high > {q66:.0f}")
        
        df = df.dropna(subset=['target'])
        df['target'] = df['target'].astype(int)
        
        logger.info(f"Target distribution:\n{df['target'].value_counts(normalize=True)}")
        return df

    def prepare_and_encode_data(self, df: pd.DataFrame):
        """Split first, THEN encode to prevent data leakage."""
        df = df.copy()
        cat_cols = ['Crime_type', 'Full Place of Occurrence', 'Month']
        
        self.feature_cols = [
            'Crime_type_enc', 'Full Place of Occurrence_enc', 'Month_enc',
            'Total Frequency', 'Frequency per Month', 'Year_numeric'
        ]
        
        # Split features and target
        X_raw = df[cat_cols + ['Total Frequency', 'Frequency per Month', 'Year_numeric']]
        y = df['target']
        
        X_train_raw, X_test_raw, y_train, y_test = train_test_split(
            X_raw, y, test_size=0.2, random_state=42, stratify=y
        )
        
        X_train = X_train_raw.copy()
        X_test = X_test_raw.copy()

        # Fit encoders on TRAIN only
        for col in cat_cols:
            le = LabelEncoder()
            X_train[col + '_enc'] = le.fit_transform(X_train_raw[col].astype(str))
            self.label_encoders[col] = le
            
            # Transform test data, handling unseen categories gracefully
            classes_dict = {c: i for i, c in enumerate(le.classes_)}
            X_test[col + '_enc'] = X_test_raw[col].astype(str).map(
                lambda x: classes_dict.get(x, 0) # Fallback to 0 if unseen
            )
            
        X_train = X_train[self.feature_cols]
        X_test = X_test[self.feature_cols]
        
        logger.info(f"Train set: {X_train.shape}, Test set: {X_test.shape}")
        return X_train, X_test, y_train, y_test

    def train_model(self, X_train, y_train, X_test, y_test):
        """Train XGBoost with early stopping."""
        self.model = xgb.XGBClassifier(
            n_estimators=500,        # Increased trees
            max_depth=5,
            learning_rate=0.05,      # Lowered learning rate
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            objective='multi:softprob',
            eval_metric='mlogloss',
            early_stopping_rounds=20,  # Moved here for XGBoost 3.x compatibility
            n_jobs=-1
        )
        
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False
        )
        
        logger.info(f"Model training completed. Best iteration: {self.model.best_iteration}")
        return self.model

    def evaluate(self, X_test, y_test):
        y_pred = self.model.predict(X_test)
        
        metrics = {
            "Accuracy": accuracy_score(y_test, y_pred),
            "Precision (Macro)": precision_score(y_test, y_pred, average='macro', zero_division=0),
            "Recall (Macro)": recall_score(y_test, y_pred, average='macro', zero_division=0),
            "F1-Score (Macro)": f1_score(y_test, y_pred, average='macro', zero_division=0)
        }
        
        logger.info("=== Evaluation Metrics ===")
        for k, v in metrics.items():
            logger.info(f"{k}: {v:.4f}")
            
        logger.info("\nClassification Report:\n" + 
                    classification_report(y_test, y_pred, target_names=['low', 'medium', 'high'], zero_division=0))
        return metrics

    def explain_model(self, X_train):
        try:
            explainer = shap.TreeExplainer(self.model)
            shap_values = explainer.shap_values(X_train)
            
            plt.clf()
            plt.figure(figsize=(10, 6))
            shap.summary_plot(shap_values, X_train, show=False)
            
            plot_path = "shap_summary.png"
            plt.tight_layout()
            plt.savefig(plot_path, dpi=150)
            plt.close()
            logger.info(f"SHAP summary plot saved to {plot_path}")
        except Exception as e:
            logger.error(f"Error during SHAP plotting: {e}")
            
        importance = pd.DataFrame({
            'feature': self.feature_cols,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        importance.to_csv("feature_importance.csv", index=False)
        return importance

    def save_model(self, path: str = "models/crime_risk_xgb.pkl"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump(self.model, path)
        logger.info(f"Model saved to {path}")

    def load_model(self, path: str = "models/crime_risk_xgb.pkl"):
        self.model = joblib.load(path)
        
    def predict_new(self, new_data: pd.DataFrame) -> np.ndarray:
        new_data = self.clean_data(new_data)
        
        for col in ['Crime_type', 'Full Place of Occurrence', 'Month']:
            le = self.label_encoders[col]
            classes_dict = {c: i for i, c in enumerate(le.classes_)}
            new_data[col + '_enc'] = new_data[col].astype(str).map(
                lambda x: classes_dict.get(x, 0)
            )
            
        X_new = new_data[self.feature_cols]
        return self.model.predict(X_new)

    def save_predictions(self, df: pd.DataFrame, predictions: np.ndarray, 
                         output_path: str = "predictions.csv"):
        df = df.copy()
        severity_reverse_map = {0: 'low', 1: 'medium', 2: 'high'}
        df['predicted_severity_code'] = predictions
        df['predicted_severity'] = df['predicted_severity_code'].map(severity_reverse_map)
        df['prediction_date'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        df.to_csv(output_path, index=False)
        logger.info(f"Saved predictions to {output_path}")

if __name__ == "__main__":
    # Safe directory change for both scripts and notebooks
    try:
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass # Running in a Jupyter Notebook / Interactive environment
    
    # Use the existing crime_review.csv dataset
    DATA_PATH = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "..", "..", "server", "data", "crime_review.csv"
    )
    DATA_PATH = os.path.normpath(DATA_PATH)
    
    # Run pipeline
    predictor = CrimeRiskPredictor(DATA_PATH)
    df = predictor.load_data()
    df = predictor.clean_data(df)
    df = predictor.create_target(df)
    
    X_train, X_test, y_train, y_test = predictor.prepare_and_encode_data(df)
    predictor.train_model(X_train, y_train, X_test, y_test)
    predictor.evaluate(X_test, y_test)
    predictor.explain_model(X_train)
    predictor.save_model()
    
    preds = predictor.predict_new(df)
    predictor.save_predictions(df, preds)