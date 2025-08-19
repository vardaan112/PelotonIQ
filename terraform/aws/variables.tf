# PelotonIQ AWS Infrastructure Variables

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
  
  validation {
    condition = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "AWS region must be a valid region format (e.g., us-west-2)."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "pelotoniq"
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access EKS cluster"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "eks_admin_users" {
  description = "List of IAM users to add to EKS cluster admin"
  type = list(object({
    userarn  = string
    username = string
    groups   = list(string)
  }))
  default = []
}

variable "public_key" {
  description = "Public key for EC2 instances"
  type        = string
  sensitive   = true
}

# RDS Variables
variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
  
  validation {
    condition = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.rds_instance_class))
    error_message = "RDS instance class must be a valid instance type."
  }
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage for RDS instance (GB)"
  type        = number
  default     = 100
  
  validation {
    condition     = var.rds_allocated_storage >= 20 && var.rds_allocated_storage <= 65536
    error_message = "RDS allocated storage must be between 20 and 65536 GB."
  }
}

variable "rds_max_allocated_storage" {
  description = "Maximum allocated storage for RDS auto-scaling (GB)"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.rds_max_allocated_storage >= var.rds_allocated_storage
    error_message = "RDS max allocated storage must be greater than or equal to allocated storage."
  }
}

variable "database_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "pelotoniq"
  
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.database_name))
    error_message = "Database name must start with a letter and contain only letters, numbers, and underscores."
  }
}

variable "database_username" {
  description = "Username for the PostgreSQL database"
  type        = string
  default     = "pelotoniq_user"
  sensitive   = true
  
  validation {
    condition     = length(var.database_username) >= 1 && length(var.database_username) <= 63
    error_message = "Database username must be between 1 and 63 characters."
  }
}

variable "database_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = true
  
  validation {
    condition     = length(var.database_password) >= 8
    error_message = "Database password must be at least 8 characters long."
  }
}

# Redis Variables
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
  
  validation {
    condition = can(regex("^cache\\.[a-z0-9]+\\.[a-z0-9]+$", var.redis_node_type))
    error_message = "Redis node type must be a valid ElastiCache instance type."
  }
}

# Monitoring Variables
variable "enable_monitoring" {
  description = "Enable comprehensive monitoring and logging"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
  
  validation {
    condition = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch log retention value."
  }
}

# Auto Scaling Variables
variable "min_nodes" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 3
  
  validation {
    condition     = var.min_nodes >= 1 && var.min_nodes <= 100
    error_message = "Minimum nodes must be between 1 and 100."
  }
}

variable "max_nodes" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 10
  
  validation {
    condition     = var.max_nodes >= var.min_nodes && var.max_nodes <= 100
    error_message = "Maximum nodes must be greater than or equal to minimum nodes and less than or equal to 100."
  }
}

variable "desired_nodes" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 3
  
  validation {
    condition     = var.desired_nodes >= var.min_nodes && var.desired_nodes <= var.max_nodes
    error_message = "Desired nodes must be between minimum and maximum nodes."
  }
}

# Backup Variables
variable "backup_retention_period" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 7
  
  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

# Security Variables
variable "enable_encryption" {
  description = "Enable encryption at rest for all supported services"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for HTTPS"
  type        = string
  default     = ""
}

# Cost Optimization Variables
variable "use_spot_instances" {
  description = "Use spot instances for non-critical workloads"
  type        = bool
  default     = false
}

variable "enable_cost_optimization" {
  description = "Enable cost optimization features"
  type        = bool
  default     = true
}

# Disaster Recovery Variables
variable "enable_multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = false
}

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup for disaster recovery"
  type        = bool
  default     = false
}

variable "backup_region" {
  description = "Region for cross-region backups"
  type        = string
  default     = "us-east-1"
}

# Application-specific Variables
variable "api_rate_limit" {
  description = "API rate limit (requests per minute)"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.api_rate_limit > 0 && var.api_rate_limit <= 10000
    error_message = "API rate limit must be between 1 and 10000 requests per minute."
  }
}

variable "max_concurrent_users" {
  description = "Maximum number of concurrent users"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.max_concurrent_users > 0 && var.max_concurrent_users <= 100000
    error_message = "Maximum concurrent users must be between 1 and 100000."
  }
}

# Feature Flags
variable "enable_ai_services" {
  description = "Enable AI/ML services and infrastructure"
  type        = bool
  default     = true
}

variable "enable_data_processing" {
  description = "Enable data processing and ETL services"
  type        = bool
  default     = true
}

variable "enable_analytics" {
  description = "Enable analytics and reporting services"
  type        = bool
  default     = true
}

# Domain and DNS Variables
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for DNS records"
  type        = string
  default     = ""
}

# Notification Variables
variable "notification_email" {
  description = "Email address for notifications and alerts"
  type        = string
  default     = ""
  
  validation {
    condition = var.notification_email == "" || can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.notification_email))
    error_message = "Notification email must be a valid email address."
  }
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

# Compliance Variables
variable "enable_compliance_logging" {
  description = "Enable compliance and audit logging"
  type        = bool
  default     = true
}

variable "data_classification" {
  description = "Data classification level (public, internal, confidential, restricted)"
  type        = string
  default     = "internal"
  
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "Data classification must be one of: public, internal, confidential, restricted."
  }
}

# Performance Variables
variable "enable_performance_monitoring" {
  description = "Enable detailed performance monitoring"
  type        = bool
  default     = true
}

variable "performance_insights_retention_period" {
  description = "Performance Insights retention period in days"
  type        = number
  default     = 7
  
  validation {
    condition     = contains([7, 31, 93, 186, 372, 731], var.performance_insights_retention_period)
    error_message = "Performance Insights retention period must be one of: 7, 31, 93, 186, 372, 731 days."
  }
}