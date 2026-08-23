provider "aws" {
  region = "us-east-1"
}

# Issue: security group wide open to the world on SSH
resource "aws_security_group" "app_sg" {
  name        = "app-sg"
  description = "Security group for the app servers"

  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Issue: S3 bucket with no encryption and public access
resource "aws_s3_bucket" "data_bucket" {
  bucket = "app-data-bucket-demo"
}

resource "aws_s3_bucket_public_access_block" "data_bucket_access" {
  bucket = aws_s3_bucket.data_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Issue: IAM policy with wildcard permissions
resource "aws_iam_policy" "app_policy" {
  name = "app-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      }
    ]
  })
}

# Issue: hardcoded credentials
resource "aws_db_instance" "app_db" {
  identifier        = "app-db"
  engine            = "postgres"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  username          = "admin"
  password          = "SuperSecret123!"
  skip_final_snapshot = true
}
