#!/usr/bin/env python3
"""
AI Model Performance Monitoring for PelotonIQ
Tracks model accuracy, drift, performance metrics, and data quality
"""

import os
import time
import json
import logging
import asyncio
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
import requests
from prometheus_client import start_http_server, Gauge, Counter, Histogram, Summary
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from scipy import stats
import tensorflow as tf
import joblib
import pickle

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('model-monitoring.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Prometheus Metrics
model_accuracy_gauge = Gauge('pelotoniq_model_accuracy', 'Model accuracy score', ['model_name', 'dataset'])
model_precision_gauge = Gauge('pelotoniq_model_precision', 'Model precision score', ['model_name', 'dataset'])
model_recall_gauge = Gauge('pelotoniq_model_recall', 'Model recall score', ['model_name', 'dataset'])
model_f1_gauge = Gauge('pelotoniq_model_f1', 'Model F1 score', ['model_name', 'dataset'])

model_inference_time = Histogram('pelotoniq_model_inference_seconds', 'Model inference time', ['model_name'])
model_prediction_counter = Counter('pelotoniq_model_predictions_total', 'Total predictions made', ['model_name', 'prediction_type'])
model_error_counter = Counter('pelotoniq_model_errors_total', 'Total model errors', ['model_name', 'error_type'])

model_drift_score = Gauge('pelotoniq_model_drift_score', 'Model drift detection score', ['model_name', 'drift_type'])
data_quality_score = Gauge('pelotoniq_data_quality_score', 'Data quality score', ['data_source', 'quality_dimension'])

model_memory_usage = Gauge('pelotoniq_model_memory_usage_bytes', 'Model memory usage', ['model_name'])
model_cpu_usage = Gauge('pelotoniq_model_cpu_usage_percent', 'Model CPU usage', ['model_name'])

feature_importance_gauge = Gauge('pelotoniq_feature_importance', 'Feature importance scores', ['model_name', 'feature_name'])
prediction_confidence_histogram = Histogram('pelotoniq_prediction_confidence', 'Prediction confidence distribution', ['model_name'])

@dataclass
class ModelMetrics:
    """Model performance metrics data class"""
    model_name: str
    timestamp: datetime
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    inference_time: float
    predictions_count: int
    errors_count: int
    drift_score: float
    confidence_mean: float
    confidence_std: float
    memory_usage: float
    cpu_usage: float

@dataclass
class DataQualityMetrics:
    """Data quality metrics data class"""
    data_source: str
    timestamp: datetime
    completeness: float
    accuracy: float
    consistency: float
    timeliness: float
    validity: float
    uniqueness: float

class ModelPerformanceTracker:
    """Main class for tracking AI model performance"""
    
    def __init__(self):
        self.db_connection = None
        self.redis_client = None
        self.models = {}
        self.monitoring_interval = int(os.getenv('MONITORING_INTERVAL', 300))  # 5 minutes
        self.drift_threshold = float(os.getenv('DRIFT_THRESHOLD', 0.05))
        self.accuracy_threshold = float(os.getenv('ACCURACY_THRESHOLD', 0.85))
        
        self._setup_connections()
        self._load_models()
        
    def _setup_connections(self):
        """Setup database and Redis connections"""
        try:
            # PostgreSQL connection
            self.db_connection = psycopg2.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                database=os.getenv('DB_NAME', 'pelotoniq'),
                user=os.getenv('DB_USER', 'pelotoniq_user'),
                password=os.getenv('DB_PASSWORD', 'password'),
                port=os.getenv('DB_PORT', 5432)
            )
            
            # Redis connection
            self.redis_client = redis.Redis(
                host=os.getenv('REDIS_HOST', 'localhost'),
                port=int(os.getenv('REDIS_PORT', 6379)),
                decode_responses=True
            )
            
            logger.info("Database and Redis connections established")
            
        except Exception as e:
            logger.error(f"Failed to setup connections: {e}")
            raise
    
    def _load_models(self):
        """Load registered models from database"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT model_name, model_path, model_type, version, status 
                    FROM ml_models 
                    WHERE status = 'active'
                """)
                
                for row in cursor.fetchall():
                    model_info = dict(row)
                    try:
                        # Load model based on type
                        if model_info['model_type'] == 'tensorflow':
                            model = tf.keras.models.load_model(model_info['model_path'])
                        elif model_info['model_type'] == 'sklearn':
                            model = joblib.load(model_info['model_path'])
                        elif model_info['model_type'] == 'pickle':
                            with open(model_info['model_path'], 'rb') as f:
                                model = pickle.load(f)
                        else:
                            logger.warning(f"Unknown model type: {model_info['model_type']}")
                            continue
                            
                        self.models[model_info['model_name']] = {
                            'model': model,
                            'info': model_info,
                            'baseline_metrics': self._get_baseline_metrics(model_info['model_name'])
                        }
                        
                        logger.info(f"Loaded model: {model_info['model_name']}")
                        
                    except Exception as e:
                        logger.error(f"Failed to load model {model_info['model_name']}: {e}")
                        
        except Exception as e:
            logger.error(f"Failed to load models: {e}")
    
    def _get_baseline_metrics(self, model_name: str) -> Dict[str, float]:
        """Get baseline metrics for drift detection"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT accuracy, precision_score, recall_score, f1_score 
                    FROM model_performance_history 
                    WHERE model_name = %s 
                    ORDER BY created_at DESC 
                    LIMIT 100
                """, (model_name,))
                
                rows = cursor.fetchall()
                if rows:
                    metrics = pd.DataFrame(rows)
                    return {
                        'accuracy_mean': metrics['accuracy'].mean(),
                        'accuracy_std': metrics['accuracy'].std(),
                        'precision_mean': metrics['precision_score'].mean(),
                        'precision_std': metrics['precision_score'].std(),
                        'recall_mean': metrics['recall_score'].mean(),
                        'recall_std': metrics['recall_score'].std(),
                        'f1_mean': metrics['f1_score'].mean(),
                        'f1_std': metrics['f1_score'].std()
                    }
                else:
                    return {}
                    
        except Exception as e:
            logger.error(f"Failed to get baseline metrics for {model_name}: {e}")
            return {}
    
    def evaluate_model_performance(self, model_name: str) -> Optional[ModelMetrics]:
        """Evaluate model performance against recent data"""
        if model_name not in self.models:
            logger.warning(f"Model {model_name} not found")
            return None
            
        try:
            model_info = self.models[model_name]
            model = model_info['model']
            
            # Get recent test data
            test_data = self._get_test_data(model_name)
            if test_data is None or len(test_data) == 0:
                logger.warning(f"No test data available for {model_name}")
                return None
            
            X_test = test_data['features']
            y_true = test_data['labels']
            
            # Make predictions
            start_time = time.time()
            
            if model_info['info']['model_type'] == 'tensorflow':
                y_pred_proba = model.predict(X_test)
                y_pred = np.argmax(y_pred_proba, axis=1)
                confidence_scores = np.max(y_pred_proba, axis=1)
            else:
                y_pred = model.predict(X_test)
                if hasattr(model, 'predict_proba'):
                    y_pred_proba = model.predict_proba(X_test)
                    confidence_scores = np.max(y_pred_proba, axis=1)
                else:
                    confidence_scores = np.ones(len(y_pred)) * 0.5  # Default confidence
            
            inference_time = time.time() - start_time
            
            # Calculate metrics
            accuracy = accuracy_score(y_true, y_pred)
            precision = precision_score(y_true, y_pred, average='weighted', zero_division=0)
            recall = recall_score(y_true, y_pred, average='weighted', zero_division=0)
            f1 = f1_score(y_true, y_pred, average='weighted', zero_division=0)
            
            # Calculate drift score
            drift_score = self._calculate_drift_score(model_name, {
                'accuracy': accuracy,
                'precision': precision,
                'recall': recall,
                'f1': f1
            })
            
            # Get resource usage
            memory_usage, cpu_usage = self._get_resource_usage(model_name)
            
            metrics = ModelMetrics(
                model_name=model_name,
                timestamp=datetime.now(),
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                inference_time=inference_time,
                predictions_count=len(y_pred),
                errors_count=0,  # TODO: Implement error tracking
                drift_score=drift_score,
                confidence_mean=np.mean(confidence_scores),
                confidence_std=np.std(confidence_scores),
                memory_usage=memory_usage,
                cpu_usage=cpu_usage
            )
            
            # Update Prometheus metrics
            self._update_prometheus_metrics(metrics, confidence_scores)
            
            # Store metrics in database
            self._store_metrics(metrics)
            
            # Check for alerts
            self._check_alerts(metrics)
            
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to evaluate model {model_name}: {e}")
            model_error_counter.labels(model_name=model_name, error_type='evaluation_error').inc()
            return None
    
    def _get_test_data(self, model_name: str) -> Optional[Dict[str, np.ndarray]]:
        """Get recent test data for model evaluation"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                # Get model configuration
                cursor.execute("""
                    SELECT test_data_query, feature_columns, target_column 
                    FROM ml_models 
                    WHERE model_name = %s
                """, (model_name,))
                
                config = cursor.fetchone()
                if not config:
                    logger.warning(f"No configuration found for model {model_name}")
                    return None
                
                # Execute test data query
                cursor.execute(config['test_data_query'])
                data = cursor.fetchall()
                
                if not data:
                    return None
                
                df = pd.DataFrame(data)
                
                # Extract features and labels
                feature_columns = json.loads(config['feature_columns'])
                target_column = config['target_column']
                
                X = df[feature_columns].values
                y = df[target_column].values
                
                return {
                    'features': X,
                    'labels': y,
                    'raw_data': df
                }
                
        except Exception as e:
            logger.error(f"Failed to get test data for {model_name}: {e}")
            return None
    
    def _calculate_drift_score(self, model_name: str, current_metrics: Dict[str, float]) -> float:
        """Calculate drift score based on baseline metrics"""
        baseline = self.models[model_name]['baseline_metrics']
        if not baseline:
            return 0.0
        
        drift_scores = []
        
        for metric_name, current_value in current_metrics.items():
            baseline_mean = baseline.get(f"{metric_name}_mean")
            baseline_std = baseline.get(f"{metric_name}_std")
            
            if baseline_mean is not None and baseline_std is not None and baseline_std > 0:
                # Calculate z-score
                z_score = abs(current_value - baseline_mean) / baseline_std
                drift_scores.append(z_score)
        
        return np.mean(drift_scores) if drift_scores else 0.0
    
    def _get_resource_usage(self, model_name: str) -> tuple:
        """Get memory and CPU usage for model"""
        try:
            # This would typically integrate with system monitoring
            # For now, return placeholder values
            memory_usage = 0.0
            cpu_usage = 0.0
            
            # Try to get from Redis cache if available
            memory_key = f"model:{model_name}:memory_usage"
            cpu_key = f"model:{model_name}:cpu_usage"
            
            cached_memory = self.redis_client.get(memory_key)
            cached_cpu = self.redis_client.get(cpu_key)
            
            if cached_memory:
                memory_usage = float(cached_memory)
            if cached_cpu:
                cpu_usage = float(cached_cpu)
            
            return memory_usage, cpu_usage
            
        except Exception as e:
            logger.error(f"Failed to get resource usage for {model_name}: {e}")
            return 0.0, 0.0
    
    def _update_prometheus_metrics(self, metrics: ModelMetrics, confidence_scores: np.ndarray):
        """Update Prometheus metrics"""
        try:
            model_accuracy_gauge.labels(model_name=metrics.model_name, dataset='test').set(metrics.accuracy)
            model_precision_gauge.labels(model_name=metrics.model_name, dataset='test').set(metrics.precision)
            model_recall_gauge.labels(model_name=metrics.model_name, dataset='test').set(metrics.recall)
            model_f1_gauge.labels(model_name=metrics.model_name, dataset='test').set(metrics.f1_score)
            
            model_inference_time.labels(model_name=metrics.model_name).observe(metrics.inference_time)
            model_prediction_counter.labels(model_name=metrics.model_name, prediction_type='batch').inc(metrics.predictions_count)
            
            model_drift_score.labels(model_name=metrics.model_name, drift_type='performance').set(metrics.drift_score)
            
            model_memory_usage.labels(model_name=metrics.model_name).set(metrics.memory_usage)
            model_cpu_usage.labels(model_name=metrics.model_name).set(metrics.cpu_usage)
            
            # Update confidence histogram
            for score in confidence_scores:
                prediction_confidence_histogram.labels(model_name=metrics.model_name).observe(score)
            
        except Exception as e:
            logger.error(f"Failed to update Prometheus metrics: {e}")
    
    def _store_metrics(self, metrics: ModelMetrics):
        """Store metrics in database"""
        try:
            with self.db_connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO model_performance_metrics 
                    (model_name, timestamp, accuracy, precision_score, recall_score, f1_score, 
                     inference_time, predictions_count, errors_count, drift_score, 
                     confidence_mean, confidence_std, memory_usage, cpu_usage)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    metrics.model_name, metrics.timestamp, metrics.accuracy, metrics.precision,
                    metrics.recall, metrics.f1_score, metrics.inference_time, metrics.predictions_count,
                    metrics.errors_count, metrics.drift_score, metrics.confidence_mean,
                    metrics.confidence_std, metrics.memory_usage, metrics.cpu_usage
                ))
                
                self.db_connection.commit()
                
        except Exception as e:
            logger.error(f"Failed to store metrics: {e}")
            self.db_connection.rollback()
    
    def _check_alerts(self, metrics: ModelMetrics):
        """Check for alert conditions"""
        alerts = []
        
        # Accuracy degradation
        if metrics.accuracy < self.accuracy_threshold:
            alerts.append({
                'type': 'accuracy_degradation',
                'severity': 'critical',
                'message': f"Model {metrics.model_name} accuracy ({metrics.accuracy:.3f}) below threshold ({self.accuracy_threshold})",
                'model_name': metrics.model_name,
                'current_value': metrics.accuracy,
                'threshold': self.accuracy_threshold
            })
        
        # Model drift
        if metrics.drift_score > self.drift_threshold:
            alerts.append({
                'type': 'model_drift',
                'severity': 'warning',
                'message': f"Model {metrics.model_name} showing drift (score: {metrics.drift_score:.3f})",
                'model_name': metrics.model_name,
                'current_value': metrics.drift_score,
                'threshold': self.drift_threshold
            })
        
        # Low confidence predictions
        if metrics.confidence_mean < 0.7:
            alerts.append({
                'type': 'low_confidence',
                'severity': 'warning',
                'message': f"Model {metrics.model_name} has low prediction confidence ({metrics.confidence_mean:.3f})",
                'model_name': metrics.model_name,
                'current_value': metrics.confidence_mean,
                'threshold': 0.7
            })
        
        # Send alerts
        for alert in alerts:
            self._send_alert(alert)
    
    def _send_alert(self, alert: Dict[str, Any]):
        """Send alert to monitoring system"""
        try:
            # Store alert in database
            with self.db_connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO model_alerts 
                    (alert_type, severity, message, model_name, current_value, threshold, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    alert['type'], alert['severity'], alert['message'], alert['model_name'],
                    alert['current_value'], alert['threshold'], datetime.now()
                ))
                
                self.db_connection.commit()
            
            # Send to external alerting system if configured
            webhook_url = os.getenv('ALERT_WEBHOOK_URL')
            if webhook_url:
                response = requests.post(webhook_url, json=alert, timeout=10)
                response.raise_for_status()
            
            logger.warning(f"Alert sent: {alert['message']}")
            
        except Exception as e:
            logger.error(f"Failed to send alert: {e}")
    
    def evaluate_data_quality(self, data_source: str) -> Optional[DataQualityMetrics]:
        """Evaluate data quality for a given source"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                # Get data quality configuration
                cursor.execute("""
                    SELECT data_query, quality_rules 
                    FROM data_sources 
                    WHERE source_name = %s
                """, (data_source,))
                
                config = cursor.fetchone()
                if not config:
                    logger.warning(f"No configuration found for data source {data_source}")
                    return None
                
                # Execute data query
                cursor.execute(config['data_query'])
                data = cursor.fetchall()
                
                if not data:
                    return None
                
                df = pd.DataFrame(data)
                quality_rules = json.loads(config['quality_rules'])
                
                # Calculate quality metrics
                completeness = self._calculate_completeness(df, quality_rules)
                accuracy = self._calculate_data_accuracy(df, quality_rules)
                consistency = self._calculate_consistency(df, quality_rules)
                timeliness = self._calculate_timeliness(df, quality_rules)
                validity = self._calculate_validity(df, quality_rules)
                uniqueness = self._calculate_uniqueness(df, quality_rules)
                
                metrics = DataQualityMetrics(
                    data_source=data_source,
                    timestamp=datetime.now(),
                    completeness=completeness,
                    accuracy=accuracy,
                    consistency=consistency,
                    timeliness=timeliness,
                    validity=validity,
                    uniqueness=uniqueness
                )
                
                # Update Prometheus metrics
                data_quality_score.labels(data_source=data_source, quality_dimension='completeness').set(completeness)
                data_quality_score.labels(data_source=data_source, quality_dimension='accuracy').set(accuracy)
                data_quality_score.labels(data_source=data_source, quality_dimension='consistency').set(consistency)
                data_quality_score.labels(data_source=data_source, quality_dimension='timeliness').set(timeliness)
                data_quality_score.labels(data_source=data_source, quality_dimension='validity').set(validity)
                data_quality_score.labels(data_source=data_source, quality_dimension='uniqueness').set(uniqueness)
                
                # Store metrics
                self._store_data_quality_metrics(metrics)
                
                return metrics
                
        except Exception as e:
            logger.error(f"Failed to evaluate data quality for {data_source}: {e}")
            return None
    
    def _calculate_completeness(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data completeness score"""
        if 'required_columns' not in rules:
            return 100.0
        
        required_columns = rules['required_columns']
        total_cells = len(df) * len(required_columns)
        non_null_cells = df[required_columns].count().sum()
        
        return (non_null_cells / total_cells) * 100 if total_cells > 0 else 0.0
    
    def _calculate_data_accuracy(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data accuracy score"""
        # Implement based on validation rules
        return 95.0  # Placeholder
    
    def _calculate_consistency(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data consistency score"""
        return 90.0  # Placeholder
    
    def _calculate_timeliness(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data timeliness score"""
        return 85.0  # Placeholder
    
    def _calculate_validity(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data validity score"""
        return 88.0  # Placeholder
    
    def _calculate_uniqueness(self, df: pd.DataFrame, rules: Dict) -> float:
        """Calculate data uniqueness score"""
        return 92.0  # Placeholder
    
    def _store_data_quality_metrics(self, metrics: DataQualityMetrics):
        """Store data quality metrics in database"""
        try:
            with self.db_connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO data_quality_metrics 
                    (data_source, timestamp, completeness, accuracy, consistency, 
                     timeliness, validity, uniqueness)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    metrics.data_source, metrics.timestamp, metrics.completeness,
                    metrics.accuracy, metrics.consistency, metrics.timeliness,
                    metrics.validity, metrics.uniqueness
                ))
                
                self.db_connection.commit()
                
        except Exception as e:
            logger.error(f"Failed to store data quality metrics: {e}")
            self.db_connection.rollback()
    
    def run_monitoring_cycle(self):
        """Run a complete monitoring cycle"""
        logger.info("Starting monitoring cycle...")
        
        # Evaluate all models
        for model_name in self.models.keys():
            try:
                metrics = self.evaluate_model_performance(model_name)
                if metrics:
                    logger.info(f"Evaluated {model_name}: accuracy={metrics.accuracy:.3f}, drift={metrics.drift_score:.3f}")
            except Exception as e:
                logger.error(f"Failed to evaluate model {model_name}: {e}")
        
        # Evaluate data quality for known sources
        data_sources = ['race_data', 'rider_data', 'weather_data']  # Configure as needed
        for source in data_sources:
            try:
                metrics = self.evaluate_data_quality(source)
                if metrics:
                    logger.info(f"Evaluated data quality for {source}: overall score={np.mean([metrics.completeness, metrics.accuracy, metrics.consistency]):.1f}")
            except Exception as e:
                logger.error(f"Failed to evaluate data quality for {source}: {e}")
        
        logger.info("Monitoring cycle completed")
    
    def start_monitoring(self):
        """Start the monitoring service"""
        logger.info(f"Starting AI model performance monitoring (interval: {self.monitoring_interval}s)")
        
        # Start Prometheus metrics server
        start_http_server(8000)
        logger.info("Prometheus metrics server started on port 8000")
        
        # Run initial monitoring cycle
        self.run_monitoring_cycle()
        
        # Schedule periodic monitoring
        def monitoring_loop():
            while True:
                try:
                    time.sleep(self.monitoring_interval)
                    self.run_monitoring_cycle()
                except Exception as e:
                    logger.error(f"Error in monitoring loop: {e}")
                    time.sleep(60)  # Wait before retrying
        
        # Start monitoring in background thread
        monitoring_thread = threading.Thread(target=monitoring_loop, daemon=True)
        monitoring_thread.start()
        
        logger.info("AI model monitoring started successfully")
        
        # Keep main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Shutting down AI model monitoring...")

def main():
    """Main entry point"""
    try:
        tracker = ModelPerformanceTracker()
        tracker.start_monitoring()
    except Exception as e:
        logger.error(f"Failed to start monitoring: {e}")
        raise

if __name__ == "__main__":
    main()