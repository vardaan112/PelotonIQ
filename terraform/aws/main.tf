# PelotonIQ AWS Infrastructure
# Terraform configuration for production deployment

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
  
  backend "s3" {
    bucket         = "pelotoniq-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "pelotoniq-terraform-locks"
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "PelotonIQ"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "DevOps Team"
      CostCenter  = "Engineering"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  vpc_cidr = "10.0.0.0/16"
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)
  
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# VPC Configuration
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  
  name = "${local.name_prefix}-vpc"
  cidr = local.vpc_cidr
  
  azs             = local.azs
  private_subnets = local.private_subnets
  public_subnets  = local.public_subnets
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  single_nat_gateway = var.environment == "dev"
  
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true
  
  # Subnets
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    Type                     = "public"
  }
  
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    Type                              = "private"
  }
  
  tags = local.tags
}

# Security Groups
resource "aws_security_group" "eks_additional" {
  name_prefix = "${local.name_prefix}-eks-additional"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }
  
  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-eks-additional-sg"
  })
}

# EKS Cluster
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"
  
  cluster_name    = "${local.name_prefix}-cluster"
  cluster_version = "1.28"
  
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  control_plane_subnet_ids       = module.vpc.private_subnets
  
  # Cluster endpoint configuration
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access_cidrs = var.allowed_cidr_blocks
  
  # Cluster logging
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  # Cluster encryption
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }
  
  # EKS Managed Node Groups
  eks_managed_node_groups = {
    # General purpose node group
    general = {
      name = "${local.name_prefix}-general"
      
      instance_types = ["t3.large", "t3.xlarge"]
      capacity_type  = "ON_DEMAND"
      
      min_size     = 3
      max_size     = 10
      desired_size = 3
      
      subnet_ids = module.vpc.private_subnets
      
      ami_type = "AL2_x86_64"
      
      # Remote access
      remote_access = {
        ec2_ssh_key = aws_key_pair.eks_nodes.key_name
        source_security_group_ids = [aws_security_group.eks_additional.id]
      }
      
      # User data
      pre_bootstrap_user_data = <<-EOT
        #!/bin/bash
        /etc/eks/bootstrap.sh ${local.name_prefix}-cluster
        yum update -y
        yum install -y amazon-cloudwatch-agent
      EOT
      
      # Taints and labels
      k8s_labels = {
        Environment = var.environment
        NodeGroup   = "general"
      }
      
      tags = merge(local.tags, {
        Name = "${local.name_prefix}-general-node"
      })
    }
    
    # Compute-intensive node group for AI workloads
    compute = {
      name = "${local.name_prefix}-compute"
      
      instance_types = ["c5.2xlarge", "c5.4xlarge"]
      capacity_type  = "SPOT"
      
      min_size     = 0
      max_size     = 5
      desired_size = 1
      
      subnet_ids = module.vpc.private_subnets
      
      ami_type = "AL2_x86_64"
      
      # Taints for AI workloads
      taints = {
        dedicated = {
          key    = "ai-workload"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
      
      k8s_labels = {
        Environment = var.environment
        NodeGroup   = "compute"
        Workload    = "ai"
      }
      
      tags = merge(local.tags, {
        Name = "${local.name_prefix}-compute-node"
      })
    }
  }
  
  # aws-auth configmap
  manage_aws_auth_configmap = true
  
  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.eks_admin.arn
      username = "eks-admin"
      groups   = ["system:masters"]
    }
  ]
  
  aws_auth_users = var.eks_admin_users
  
  tags = local.tags
}

# RDS PostgreSQL Database
resource "aws_db_subnet_group" "pelotoniq" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-rds-sg"
  })
}

resource "aws_db_instance" "pelotoniq" {
  identifier = "${local.name_prefix}-postgres"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.rds_instance_class
  
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds.arn
  
  db_name  = var.database_name
  username = var.database_username
  password = var.database_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.pelotoniq.name
  
  backup_retention_period = var.environment == "prod" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  # Enhanced monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  # Performance insights
  performance_insights_enabled = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn
  performance_insights_retention_period = var.environment == "prod" ? 731 : 7
  
  # Multi-AZ for production
  multi_az = var.environment == "prod"
  
  deletion_protection = var.environment == "prod"
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

# ElastiCache Redis Cluster
resource "aws_elasticache_subnet_group" "pelotoniq" {
  name       = "${local.name_prefix}-cache-subnet"
  subnet_ids = module.vpc.private_subnets
  
  tags = local.tags
}

resource "aws_security_group" "elasticache" {
  name_prefix = "${local.name_prefix}-cache"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-cache-sg"
  })
}

resource "aws_elasticache_replication_group" "pelotoniq" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Redis cluster for PelotonIQ"
  
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = "default.redis7"
  
  num_cache_clusters = var.environment == "prod" ? 3 : 1
  
  engine_version = "7.0"
  
  subnet_group_name  = aws_elasticache_subnet_group.pelotoniq.name
  security_group_ids = [aws_security_group.elasticache.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  automatic_failover_enabled = var.environment == "prod"
  multi_az_enabled          = var.environment == "prod"
  
  # Backup configuration
  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  snapshot_window         = "03:00-05:00"
  
  # Maintenance
  maintenance_window = "sun:05:00-sun:07:00"
  
  tags = local.tags
}

# Application Load Balancer
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-alb-sg"
  })
}

resource "aws_lb" "pelotoniq" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = module.vpc.public_subnets
  
  enable_deletion_protection = var.environment == "prod"
  
  # Access logs
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "access-logs"
    enabled = true
  }
  
  tags = local.tags
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "pelotoniq" {
  origin {
    domain_name = aws_lb.pelotoniq.dns_name
    origin_id   = "ALB-${local.name_prefix}"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  # Cache behaviors
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-${local.name_prefix}"
    
    forwarded_values {
      query_string = false
      headers      = ["Authorization", "CloudFront-Forwarded-Proto"]
      
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }
  
  # API cache behavior
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-${local.name_prefix}"
    
    forwarded_values {
      query_string = true
      headers      = ["*"]
      
      cookies {
        forward = "all"
      }
    }
    
    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }
  
  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  # SSL Certificate
  viewer_certificate {
    cloudfront_default_certificate = true
    # For custom domain: acm_certificate_arn = aws_acm_certificate.pelotoniq.arn
    # ssl_support_method = "sni-only"
  }
  
  tags = local.tags
}

# S3 Buckets
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${local.name_prefix}-alb-logs-${random_id.bucket_suffix.hex}"
  
  tags = local.tags
}

resource "aws_s3_bucket" "ai_models" {
  bucket = "${local.name_prefix}-ai-models-${random_id.bucket_suffix.hex}"
  
  tags = local.tags
}

resource "aws_s3_bucket" "data_backups" {
  bucket = "${local.name_prefix}-data-backups-${random_id.bucket_suffix.hex}"
  
  tags = local.tags
}

# Random ID for unique bucket names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# S3 Bucket configurations
resource "aws_s3_bucket_versioning" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.s3.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }
}

# IAM Roles and Policies
resource "aws_iam_role" "eks_admin" {
  name = "${local.name_prefix}-eks-admin"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
      }
    ]
  })
  
  tags = local.tags
}

# KMS Keys
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption"
  deletion_window_in_days = 7
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-eks-key"
  })
}

resource "aws_kms_key" "rds" {
  description             = "RDS Encryption"
  deletion_window_in_days = 7
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-rds-key"
  })
}

resource "aws_kms_key" "s3" {
  description             = "S3 Bucket Encryption"
  deletion_window_in_days = 7
  
  tags = merge(local.tags, {
    Name = "${local.name_prefix}-s3-key"
  })
}

# Key Pair for EC2 instances
resource "aws_key_pair" "eks_nodes" {
  key_name   = "${local.name_prefix}-eks-nodes"
  public_key = var.public_key
  
  tags = local.tags
}

# RDS Monitoring Role
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}