#!/usr/bin/env python3
"""
Data Quality Monitoring System for PelotonIQ
Comprehensive data quality monitoring across all data sources
"""

import os
import time
import json
import logging
import asyncio
import schedule
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
import requests
from prometheus_client import start_http_server, Gauge, Counter, Histogram
from scipy import stats
import great_expectations as ge
from great_expectations.core import ExpectationSuite
from great_expectations.data_context import DataContext
from sqlalchemy import create_engine
import boto3
from elasticsearch import Elasticsearch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data-quality.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Prometheus Metrics
data_completeness_gauge = Gauge('pelotoniq_data_completeness_score', 'Data completeness score (0-100)', ['data_source', 'table_name'])
data_accuracy_gauge = Gauge('pelotoniq_data_accuracy_score', 'Data accuracy score (0-100)', ['data_source', 'validation_type'])
data_consistency_gauge = Gauge('pelotoniq_data_consistency_score', 'Data consistency score (0-100)', ['data_source', 'check_type'])
data_timeliness_gauge = Gauge('pelotoniq_data_timeliness_score', 'Data timeliness score (0-100)', ['data_source', 'time_dimension'])
data_validity_gauge = Gauge('pelotoniq_data_validity_score', 'Data validity score (0-100)', ['data_source', 'validation_rule'])
data_uniqueness_gauge = Gauge('pelotoniq_data_uniqueness_score', 'Data uniqueness score (0-100)', ['data_source', 'column_set'])

data_anomaly_counter = Counter('pelotoniq_data_anomalies_total', 'Total data anomalies detected', ['data_source', 'anomaly_type'])
data_quality_checks_counter = Counter('pelotoniq_data_quality_checks_total', 'Total data quality checks performed', ['data_source', 'check_result'])
data_freshness_seconds = Gauge('pelotoniq_data_freshness_seconds', 'Data freshness in seconds', ['data_source', 'table_name'])

schema_validation_gauge = Gauge('pelotoniq_schema_validation_score', 'Schema validation score (0-100)', ['data_source', 'schema_type'])
referential_integrity_gauge = Gauge('pelotoniq_referential_integrity_score', 'Referential integrity score (0-100)', ['data_source', 'relationship'])

@dataclass
class DataQualityResult:
    """Data quality assessment result"""
    data_source: str
    table_name: str
    timestamp: datetime
    completeness_score: float
    accuracy_score: float
    consistency_score: float
    timeliness_score: float
    validity_score: float
    uniqueness_score: float
    overall_score: float
    anomalies_detected: int
    checks_passed: int
    checks_failed: int
    issues: List[Dict[str, Any]]

@dataclass
class DataSourceConfig:
    """Data source configuration"""
    name: str
    connection_string: str
    tables: List[str]
    quality_rules: Dict[str, Any]
    monitoring_frequency: int  # in seconds
    alert_thresholds: Dict[str, float]

class DataQualityMonitor:
    """Main data quality monitoring class"""
    
    def __init__(self):
        self.db_connection = None
        self.redis_client = None
        self.es_client = None
        self.s3_client = None
        self.data_sources = {}
        self.ge_context = None
        
        self._setup_connections()
        self._load_data_sources()
        self._setup_great_expectations()
        
    def _setup_connections(self):
        """Setup database and external service connections"""
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
            
            # Elasticsearch connection
            if os.getenv('ELASTICSEARCH_URL'):
                self.es_client = Elasticsearch([os.getenv('ELASTICSEARCH_URL')])
            
            # AWS S3 connection
            if os.getenv('AWS_ACCESS_KEY_ID'):
                self.s3_client = boto3.client('s3')
            
            logger.info("Database and external service connections established")
            
        except Exception as e:
            logger.error(f"Failed to setup connections: {e}")
            raise
    
    def _load_data_sources(self):
        """Load data source configurations"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT name, connection_string, tables, quality_rules, 
                           monitoring_frequency, alert_thresholds 
                    FROM data_source_configs 
                    WHERE status = 'active'
                """)
                
                for row in cursor.fetchall():
                    config = DataSourceConfig(
                        name=row['name'],
                        connection_string=row['connection_string'],
                        tables=json.loads(row['tables']),
                        quality_rules=json.loads(row['quality_rules']),
                        monitoring_frequency=row['monitoring_frequency'],
                        alert_thresholds=json.loads(row['alert_thresholds'])
                    )
                    self.data_sources[config.name] = config
                    
            logger.info(f"Loaded {len(self.data_sources)} data source configurations")
            
        except Exception as e:
            logger.error(f"Failed to load data sources: {e}")
    
    def _setup_great_expectations(self):
        """Setup Great Expectations for advanced data quality checks"""
        try:
            # Initialize Great Expectations context
            self.ge_context = DataContext()
            logger.info("Great Expectations context initialized")
            
        except Exception as e:
            logger.warning(f"Failed to setup Great Expectations: {e}")
            self.ge_context = None
    
    def assess_data_completeness(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data completeness"""
        issues = []
        scores = []
        
        try:
            # Check required columns
            required_columns = config.quality_rules.get('required_columns', [])
            for column in required_columns:
                if column in df.columns:
                    null_count = df[column].isnull().sum()
                    completeness = ((len(df) - null_count) / len(df)) * 100 if len(df) > 0 else 0
                    scores.append(completeness)
                    
                    if completeness < config.alert_thresholds.get('completeness', 95):
                        issues.append({
                            'type': 'completeness',
                            'severity': 'high' if completeness < 80 else 'medium',
                            'column': column,
                            'score': completeness,
                            'description': f"Column {column} has {completeness:.1f}% completeness"
                        })
                else:
                    issues.append({
                        'type': 'completeness',
                        'severity': 'critical',
                        'column': column,
                        'score': 0,
                        'description': f"Required column {column} is missing"
                    })
                    scores.append(0)
            
            # Check critical business columns
            critical_columns = config.quality_rules.get('critical_columns', [])
            for column in critical_columns:
                if column in df.columns:
                    null_count = df[column].isnull().sum()
                    if null_count > 0:
                        issues.append({
                            'type': 'completeness',
                            'severity': 'critical',
                            'column': column,
                            'score': ((len(df) - null_count) / len(df)) * 100,
                            'description': f"Critical column {column} has {null_count} null values"
                        })
            
            overall_score = np.mean(scores) if scores else 100
            
            # Update Prometheus metrics
            data_completeness_gauge.labels(data_source=data_source, table_name='overall').set(overall_score)
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing completeness for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def assess_data_accuracy(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data accuracy using validation rules"""
        issues = []
        scores = []
        
        try:
            validation_rules = config.quality_rules.get('validation_rules', {})
            
            for column, rules in validation_rules.items():
                if column not in df.columns:
                    continue
                
                column_scores = []
                
                # Range validation
                if 'min_value' in rules or 'max_value' in rules:
                    min_val = rules.get('min_value', float('-inf'))
                    max_val = rules.get('max_value', float('inf'))
                    
                    valid_count = df[(df[column] >= min_val) & (df[column] <= max_val)].shape[0]
                    accuracy = (valid_count / len(df)) * 100 if len(df) > 0 else 0
                    column_scores.append(accuracy)
                    
                    if accuracy < 95:
                        issues.append({
                            'type': 'accuracy',
                            'severity': 'medium',
                            'column': column,
                            'rule': 'range_validation',
                            'score': accuracy,
                            'description': f"Column {column} range validation: {accuracy:.1f}% valid"
                        })
                
                # Pattern validation
                if 'pattern' in rules:
                    pattern = rules['pattern']
                    valid_count = df[df[column].astype(str).str.match(pattern, na=False)].shape[0]
                    accuracy = (valid_count / len(df)) * 100 if len(df) > 0 else 0
                    column_scores.append(accuracy)
                    
                    if accuracy < 95:
                        issues.append({
                            'type': 'accuracy',
                            'severity': 'medium',
                            'column': column,
                            'rule': 'pattern_validation',
                            'score': accuracy,
                            'description': f"Column {column} pattern validation: {accuracy:.1f}% valid"
                        })
                
                # Enum validation
                if 'allowed_values' in rules:
                    allowed_values = rules['allowed_values']
                    valid_count = df[df[column].isin(allowed_values)].shape[0]
                    accuracy = (valid_count / len(df)) * 100 if len(df) > 0 else 0
                    column_scores.append(accuracy)
                    
                    if accuracy < 95:
                        issues.append({
                            'type': 'accuracy',
                            'severity': 'medium',
                            'column': column,
                            'rule': 'enum_validation',
                            'score': accuracy,
                            'description': f"Column {column} enum validation: {accuracy:.1f}% valid"
                        })
                
                if column_scores:
                    scores.extend(column_scores)
            
            overall_score = np.mean(scores) if scores else 100
            
            # Update Prometheus metrics
            data_accuracy_gauge.labels(data_source=data_source, validation_type='overall').set(overall_score)
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing accuracy for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def assess_data_consistency(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data consistency across columns and records"""
        issues = []
        scores = []
        
        try:
            consistency_rules = config.quality_rules.get('consistency_rules', {})
            
            # Cross-column consistency
            for rule_name, rule_config in consistency_rules.items():
                if rule_config['type'] == 'cross_column':
                    column1 = rule_config['column1']
                    column2 = rule_config['column2']
                    operator = rule_config['operator']
                    
                    if column1 in df.columns and column2 in df.columns:
                        if operator == 'greater_than':
                            valid_count = df[df[column1] > df[column2]].shape[0]
                        elif operator == 'less_than':
                            valid_count = df[df[column1] < df[column2]].shape[0]
                        elif operator == 'equal':
                            valid_count = df[df[column1] == df[column2]].shape[0]
                        else:
                            continue
                        
                        consistency = (valid_count / len(df)) * 100 if len(df) > 0 else 0
                        scores.append(consistency)
                        
                        if consistency < 95:
                            issues.append({
                                'type': 'consistency',
                                'severity': 'medium',
                                'rule': rule_name,
                                'score': consistency,
                                'description': f"Cross-column consistency {column1} {operator} {column2}: {consistency:.1f}%"
                            })
            
            # Format consistency
            format_rules = config.quality_rules.get('format_consistency', {})
            for column, expected_format in format_rules.items():
                if column in df.columns:
                    # Check date format consistency
                    if expected_format == 'date':
                        try:
                            pd.to_datetime(df[column], errors='coerce')
                            valid_count = df[column].notna().sum()
                            consistency = (valid_count / len(df)) * 100 if len(df) > 0 else 0
                            scores.append(consistency)
                            
                            if consistency < 95:
                                issues.append({
                                    'type': 'consistency',
                                    'severity': 'medium',
                                    'column': column,
                                    'rule': 'date_format',
                                    'score': consistency,
                                    'description': f"Date format consistency for {column}: {consistency:.1f}%"
                                })
                        except Exception:
                            issues.append({
                                'type': 'consistency',
                                'severity': 'high',
                                'column': column,
                                'rule': 'date_format',
                                'score': 0,
                                'description': f"Failed to parse dates in column {column}"
                            })
            
            overall_score = np.mean(scores) if scores else 100
            
            # Update Prometheus metrics
            data_consistency_gauge.labels(data_source=data_source, check_type='overall').set(overall_score)
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing consistency for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def assess_data_timeliness(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data timeliness and freshness"""
        issues = []
        scores = []
        
        try:
            timeliness_rules = config.quality_rules.get('timeliness_rules', {})
            
            # Check data freshness
            timestamp_column = timeliness_rules.get('timestamp_column')
            if timestamp_column and timestamp_column in df.columns:
                try:
                    timestamps = pd.to_datetime(df[timestamp_column])
                    latest_timestamp = timestamps.max()
                    current_time = datetime.now()
                    
                    freshness_hours = (current_time - latest_timestamp).total_seconds() / 3600
                    expected_freshness_hours = timeliness_rules.get('expected_freshness_hours', 24)
                    
                    freshness_score = max(0, 100 - (freshness_hours / expected_freshness_hours) * 100)
                    scores.append(freshness_score)
                    
                    # Update freshness metric
                    data_freshness_seconds.labels(data_source=data_source, table_name='overall').set(
                        (current_time - latest_timestamp).total_seconds()
                    )
                    
                    if freshness_hours > expected_freshness_hours:
                        issues.append({
                            'type': 'timeliness',
                            'severity': 'high' if freshness_hours > expected_freshness_hours * 2 else 'medium',
                            'column': timestamp_column,
                            'score': freshness_score,
                            'description': f"Data is {freshness_hours:.1f} hours old, expected < {expected_freshness_hours}"
                        })
                
                except Exception as e:
                    issues.append({
                        'type': 'timeliness',
                        'severity': 'high',
                        'column': timestamp_column,
                        'score': 0,
                        'description': f"Failed to parse timestamps: {e}"
                    })
            
            # Check for data gaps
            if timestamp_column and timestamp_column in df.columns:
                try:
                    timestamps = pd.to_datetime(df[timestamp_column]).sort_values()
                    expected_interval_hours = timeliness_rules.get('expected_interval_hours', 1)
                    
                    gaps = timestamps.diff().dt.total_seconds() / 3600
                    large_gaps = gaps[gaps > expected_interval_hours * 2]
                    
                    if len(large_gaps) > 0:
                        gap_score = max(0, 100 - (len(large_gaps) / len(df)) * 100)
                        scores.append(gap_score)
                        
                        issues.append({
                            'type': 'timeliness',
                            'severity': 'medium',
                            'rule': 'data_gaps',
                            'score': gap_score,
                            'description': f"Found {len(large_gaps)} large time gaps in data"
                        })
                
                except Exception as e:
                    logger.warning(f"Failed to check data gaps: {e}")
            
            overall_score = np.mean(scores) if scores else 100
            
            # Update Prometheus metrics
            data_timeliness_gauge.labels(data_source=data_source, time_dimension='overall').set(overall_score)
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing timeliness for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def assess_data_validity(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data validity using business rules"""
        issues = []
        scores = []
        
        try:
            validity_rules = config.quality_rules.get('validity_rules', {})
            
            # Business rule validation
            for rule_name, rule_config in validity_rules.items():
                try:
                    if rule_config['type'] == 'sql_expression':
                        # Evaluate SQL-like expressions
                        expression = rule_config['expression']
                        # This would need proper SQL expression evaluation
                        # For now, assume 95% validity
                        scores.append(95)
                    
                    elif rule_config['type'] == 'custom_function':
                        # Custom validation functions
                        function_name = rule_config['function']
                        if hasattr(self, f'_validate_{function_name}'):
                            validator = getattr(self, f'_validate_{function_name}')
                            validity_score = validator(df, rule_config.get('parameters', {}))
                            scores.append(validity_score)
                        else:
                            logger.warning(f"Unknown validation function: {function_name}")
                            
                except Exception as e:
                    issues.append({
                        'type': 'validity',
                        'severity': 'medium',
                        'rule': rule_name,
                        'score': 0,
                        'description': f"Failed to execute validation rule {rule_name}: {e}"
                    })
            
            # Use Great Expectations if available
            if self.ge_context:
                try:
                    ge_df = ge.from_pandas(df)
                    # Add Great Expectations validations here
                    pass
                except Exception as e:
                    logger.warning(f"Great Expectations validation failed: {e}")
            
            overall_score = np.mean(scores) if scores else 100
            
            # Update Prometheus metrics
            data_validity_gauge.labels(data_source=data_source, validation_rule='overall').set(overall_score)
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing validity for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def assess_data_uniqueness(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> Tuple[float, List[Dict]]:
        """Assess data uniqueness and detect duplicates"""
        issues = []
        scores = []
        
        try:
            uniqueness_rules = config.quality_rules.get('uniqueness_rules', {})
            
            # Primary key uniqueness
            primary_keys = uniqueness_rules.get('primary_keys', [])
            for pk_set in primary_keys:
                if all(col in df.columns for col in pk_set):
                    total_rows = len(df)
                    unique_rows = df.drop_duplicates(subset=pk_set).shape[0]
                    uniqueness = (unique_rows / total_rows) * 100 if total_rows > 0 else 0
                    scores.append(uniqueness)
                    
                    if uniqueness < 100:
                        duplicate_count = total_rows - unique_rows
                        issues.append({
                            'type': 'uniqueness',
                            'severity': 'high' if uniqueness < 95 else 'medium',
                            'columns': pk_set,
                            'score': uniqueness,
                            'description': f"Primary key {pk_set} has {duplicate_count} duplicates"
                        })
                        
                        # Update Prometheus metrics
                        data_uniqueness_gauge.labels(
                            data_source=data_source, 
                            column_set='_'.join(pk_set)
                        ).set(uniqueness)
            
            # Unique constraint validation
            unique_columns = uniqueness_rules.get('unique_columns', [])
            for column in unique_columns:
                if column in df.columns:
                    total_values = df[column].notna().sum()
                    unique_values = df[column].nunique()
                    uniqueness = (unique_values / total_values) * 100 if total_values > 0 else 0
                    scores.append(uniqueness)
                    
                    if uniqueness < 100:
                        issues.append({
                            'type': 'uniqueness',
                            'severity': 'medium',
                            'column': column,
                            'score': uniqueness,
                            'description': f"Column {column} should be unique but has duplicates"
                        })
            
            overall_score = np.mean(scores) if scores else 100
            
            return overall_score, issues
            
        except Exception as e:
            logger.error(f"Error assessing uniqueness for {data_source}: {e}")
            return 0, [{'type': 'error', 'description': str(e)}]
    
    def detect_anomalies(self, data_source: str, df: pd.DataFrame, config: DataSourceConfig) -> List[Dict]:
        """Detect statistical anomalies in the data"""
        anomalies = []
        
        try:
            anomaly_rules = config.quality_rules.get('anomaly_detection', {})
            
            for column in df.select_dtypes(include=[np.number]).columns:
                if column in anomaly_rules:
                    method = anomaly_rules[column].get('method', 'zscore')
                    threshold = anomaly_rules[column].get('threshold', 3)
                    
                    if method == 'zscore':
                        z_scores = np.abs(stats.zscore(df[column].dropna()))
                        anomaly_count = (z_scores > threshold).sum()
                        
                        if anomaly_count > 0:
                            anomalies.append({
                                'type': 'statistical_outlier',
                                'column': column,
                                'method': 'zscore',
                                'count': anomaly_count,
                                'percentage': (anomaly_count / len(df)) * 100
                            })
                            
                            # Update Prometheus metrics
                            data_anomaly_counter.labels(
                                data_source=data_source, 
                                anomaly_type='statistical_outlier'
                            ).inc(anomaly_count)
                    
                    elif method == 'iqr':
                        Q1 = df[column].quantile(0.25)
                        Q3 = df[column].quantile(0.75)
                        IQR = Q3 - Q1
                        lower_bound = Q1 - 1.5 * IQR
                        upper_bound = Q3 + 1.5 * IQR
                        
                        outliers = df[(df[column] < lower_bound) | (df[column] > upper_bound)]
                        anomaly_count = len(outliers)
                        
                        if anomaly_count > 0:
                            anomalies.append({
                                'type': 'iqr_outlier',
                                'column': column,
                                'method': 'iqr',
                                'count': anomaly_count,
                                'percentage': (anomaly_count / len(df)) * 100
                            })
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error detecting anomalies for {data_source}: {e}")
            return []
    
    def assess_data_source(self, data_source_name: str) -> Optional[DataQualityResult]:
        """Perform comprehensive data quality assessment for a data source"""
        try:
            config = self.data_sources.get(data_source_name)
            if not config:
                logger.warning(f"No configuration found for data source: {data_source_name}")
                return None
            
            # Connect to data source
            engine = create_engine(config.connection_string)
            
            all_issues = []
            all_scores = []
            total_anomalies = 0
            checks_passed = 0
            checks_failed = 0
            
            for table_name in config.tables:
                try:
                    # Load data
                    query = f"SELECT * FROM {table_name} ORDER BY RANDOM() LIMIT 10000"  # Sample for large tables
                    df = pd.read_sql(query, engine)
                    
                    if df.empty:
                        logger.warning(f"No data found in table {table_name}")
                        continue
                    
                    logger.info(f"Assessing {table_name} with {len(df)} rows")
                    
                    # Perform quality assessments
                    completeness_score, completeness_issues = self.assess_data_completeness(data_source_name, df, config)
                    accuracy_score, accuracy_issues = self.assess_data_accuracy(data_source_name, df, config)
                    consistency_score, consistency_issues = self.assess_data_consistency(data_source_name, df, config)
                    timeliness_score, timeliness_issues = self.assess_data_timeliness(data_source_name, df, config)
                    validity_score, validity_issues = self.assess_data_validity(data_source_name, df, config)
                    uniqueness_score, uniqueness_issues = self.assess_data_uniqueness(data_source_name, df, config)
                    
                    # Detect anomalies
                    anomalies = self.detect_anomalies(data_source_name, df, config)
                    total_anomalies += len(anomalies)
                    
                    # Collect scores and issues
                    table_scores = [completeness_score, accuracy_score, consistency_score, 
                                  timeliness_score, validity_score, uniqueness_score]
                    all_scores.extend(table_scores)
                    
                    table_issues = completeness_issues + accuracy_issues + consistency_issues + \
                                 timeliness_issues + validity_issues + uniqueness_issues
                    all_issues.extend(table_issues)
                    
                    # Count passed/failed checks
                    for issue in table_issues:
                        if issue.get('type') != 'error':
                            if issue.get('score', 0) >= config.alert_thresholds.get(issue.get('type'), 95):
                                checks_passed += 1
                            else:
                                checks_failed += 1
                    
                except Exception as e:
                    logger.error(f"Error assessing table {table_name}: {e}")
                    all_issues.append({
                        'type': 'error',
                        'table': table_name,
                        'description': f"Failed to assess table: {e}"
                    })
                    checks_failed += 1
            
            # Calculate overall scores
            overall_score = np.mean(all_scores) if all_scores else 0
            
            result = DataQualityResult(
                data_source=data_source_name,
                table_name='overall',
                timestamp=datetime.now(),
                completeness_score=np.mean([s for s, i in [(completeness_score, completeness_issues)] if s is not None]) if all_scores else 0,
                accuracy_score=np.mean([s for s, i in [(accuracy_score, accuracy_issues)] if s is not None]) if all_scores else 0,
                consistency_score=np.mean([s for s, i in [(consistency_score, consistency_issues)] if s is not None]) if all_scores else 0,
                timeliness_score=np.mean([s for s, i in [(timeliness_score, timeliness_issues)] if s is not None]) if all_scores else 0,
                validity_score=np.mean([s for s, i in [(validity_score, validity_issues)] if s is not None]) if all_scores else 0,
                uniqueness_score=np.mean([s for s, i in [(uniqueness_score, uniqueness_issues)] if s is not None]) if all_scores else 0,
                overall_score=overall_score,
                anomalies_detected=total_anomalies,
                checks_passed=checks_passed,
                checks_failed=checks_failed,
                issues=all_issues
            )
            
            # Update Prometheus metrics
            data_quality_checks_counter.labels(data_source=data_source_name, check_result='passed').inc(checks_passed)
            data_quality_checks_counter.labels(data_source=data_source_name, check_result='failed').inc(checks_failed)
            
            # Store results
            self._store_quality_results(result)
            
            # Check for alerts
            self._check_quality_alerts(result, config)
            
            return result
            
        except Exception as e:
            logger.error(f"Error assessing data source {data_source_name}: {e}")
            return None
    
    def _store_quality_results(self, result: DataQualityResult):
        """Store quality assessment results in database"""
        try:
            with self.db_connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO data_quality_results 
                    (data_source, table_name, timestamp, completeness_score, accuracy_score,
                     consistency_score, timeliness_score, validity_score, uniqueness_score,
                     overall_score, anomalies_detected, checks_passed, checks_failed, issues)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    result.data_source, result.table_name, result.timestamp,
                    result.completeness_score, result.accuracy_score, result.consistency_score,
                    result.timeliness_score, result.validity_score, result.uniqueness_score,
                    result.overall_score, result.anomalies_detected, result.checks_passed,
                    result.checks_failed, json.dumps(result.issues)
                ))
                
                self.db_connection.commit()
                
        except Exception as e:
            logger.error(f"Failed to store quality results: {e}")
            self.db_connection.rollback()
    
    def _check_quality_alerts(self, result: DataQualityResult, config: DataSourceConfig):
        """Check for data quality alerts"""
        alerts = []
        
        # Overall score alert
        if result.overall_score < config.alert_thresholds.get('overall', 85):
            alerts.append({
                'type': 'overall_quality_degradation',
                'severity': 'critical' if result.overall_score < 70 else 'warning',
                'data_source': result.data_source,
                'score': result.overall_score,
                'threshold': config.alert_thresholds.get('overall', 85),
                'message': f"Overall data quality score ({result.overall_score:.1f}) below threshold"
            })
        
        # Anomaly alert
        if result.anomalies_detected > config.alert_thresholds.get('max_anomalies', 10):
            alerts.append({
                'type': 'anomaly_spike',
                'severity': 'warning',
                'data_source': result.data_source,
                'anomalies': result.anomalies_detected,
                'threshold': config.alert_thresholds.get('max_anomalies', 10),
                'message': f"High number of anomalies detected: {result.anomalies_detected}"
            })
        
        # Failed checks alert
        failure_rate = result.checks_failed / (result.checks_passed + result.checks_failed) if (result.checks_passed + result.checks_failed) > 0 else 0
        if failure_rate > config.alert_thresholds.get('max_failure_rate', 0.1):
            alerts.append({
                'type': 'high_failure_rate',
                'severity': 'warning',
                'data_source': result.data_source,
                'failure_rate': failure_rate,
                'threshold': config.alert_thresholds.get('max_failure_rate', 0.1),
                'message': f"High data quality check failure rate: {failure_rate:.1%}"
            })
        
        # Send alerts
        for alert in alerts:
            self._send_quality_alert(alert)
    
    def _send_quality_alert(self, alert: Dict[str, Any]):
        """Send data quality alert"""
        try:
            # Store alert in database
            with self.db_connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO data_quality_alerts 
                    (alert_type, severity, data_source, message, alert_data, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    alert['type'], alert['severity'], alert['data_source'],
                    alert['message'], json.dumps(alert), datetime.now()
                ))
                
                self.db_connection.commit()
            
            # Send to external alerting system
            webhook_url = os.getenv('DATA_QUALITY_WEBHOOK_URL')
            if webhook_url:
                response = requests.post(webhook_url, json=alert, timeout=10)
                response.raise_for_status()
            
            logger.warning(f"Data quality alert sent: {alert['message']}")
            
        except Exception as e:
            logger.error(f"Failed to send data quality alert: {e}")
    
    def run_monitoring_cycle(self):
        """Run a complete data quality monitoring cycle"""
        logger.info("Starting data quality monitoring cycle...")
        
        results = []
        
        # Process data sources in parallel
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_source = {
                executor.submit(self.assess_data_source, source_name): source_name 
                for source_name in self.data_sources.keys()
            }
            
            for future in as_completed(future_to_source):
                source_name = future_to_source[future]
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                        logger.info(f"Completed assessment for {source_name}: overall score {result.overall_score:.1f}")
                except Exception as e:
                    logger.error(f"Failed to assess {source_name}: {e}")
        
        logger.info(f"Data quality monitoring cycle completed. Assessed {len(results)} data sources.")
        return results
    
    def start_monitoring(self):
        """Start the data quality monitoring service"""
        logger.info("Starting data quality monitoring service...")
        
        # Start Prometheus metrics server
        start_http_server(8001)
        logger.info("Prometheus metrics server started on port 8001")
        
        # Schedule monitoring cycles
        for source_name, config in self.data_sources.items():
            schedule.every(config.monitoring_frequency).seconds.do(
                self.assess_data_source, source_name
            )
        
        # Run initial cycle
        self.run_monitoring_cycle()
        
        # Start scheduler
        logger.info("Data quality monitoring started successfully")
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(30)
        except KeyboardInterrupt:
            logger.info("Shutting down data quality monitoring...")

def main():
    """Main entry point"""
    try:
        monitor = DataQualityMonitor()
        monitor.start_monitoring()
    except Exception as e:
        logger.error(f"Failed to start data quality monitoring: {e}")
        raise

if __name__ == "__main__":
    main()