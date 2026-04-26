#!/bin/bash
set -e

echo "1. Installing Docker and dependencies..."
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER

echo "2. Authenticating Docker with GCP Artifact Registry..."
# Need to ensure correct permission to use credential helper
docker-credential-gcloud gcloud-credential-helper configure-docker --registries=asia-northeast3-docker.pkg.dev || echo "Skipping docker auth error, may already be configured"

echo "3. Creating application directory..."
mkdir -p ~/k-auction
cd ~/k-auction

echo "Deployment environment ready!"
