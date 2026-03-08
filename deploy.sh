#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

PROJECT_ID="austin-test-450819"
SERVICE_NAME="newtons-gravity"
REGION="us-central1" # You can change this to your preferred region (e.g., us-east1, europe-west1)
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "======================================================"
echo " Starting Build & Deploy Process for: $SERVICE_NAME"
echo " Project ID: $PROJECT_ID"
echo " Image: $IMAGE_NAME"
echo " Region: $REGION"
echo "======================================================"

# 1. Build the Docker image locally
echo -e "\n[1/3] Building the Docker image locally..."
# Pass the local gcloud credentials to the docker build process so it can fetch the Secret
docker build \
  --platform linux/amd64 \
  --secret id=gcp_env,src=$HOME/.config/gcloud/application_default_credentials.json \
  -t $IMAGE_NAME .

# 2. Push the Docker image to Google Container Registry
echo -e "\n[2/3] Pushing the Docker image to Google Container Registry..."
# Ensure Docker is authenticated with gcloud
gcloud auth configure-docker --quiet
docker push $IMAGE_NAME

# 3. Deploy the image to Google Cloud Run
echo -e "\n[3/3] Deploying to Google Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --project $PROJECT_ID \
  --port 3000

echo -e "\n======================================================"
echo " Deployment Complete!"
echo "======================================================"
