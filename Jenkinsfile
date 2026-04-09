pipeline {
  agent any

  environment {
    IMAGE = "5g-handover-ai:latest"
    WORK  = "${env.WORKSPACE}"
  }

  stages {
    stage('Prepare') {
      steps {
        echo 'Workspace already checked out by Jenkins. Using local code/models.'
        // If models live in a different repo, replace this stage with a git step pointing to the real URL and credentials.
      }
    }

    stage('AI Validation & Testing') {
      steps {
        echo 'Running Unit Tests on XGBoost Models...'
        sh 'python test_models.py'
      }
    }

    stage('Build Docker Image') {
      steps {
        echo 'Packaging AI into Docker Container (build runs on host Docker daemon)...'
        sh """
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v ${WORK}:/workspace docker:24.0.5-cli \
            sh -c "cd /workspace && docker build -t ${IMAGE} ."
        """
      }
    }

    stage('Push to Docker Registry (optional)') {
      steps {
        echo 'If you want to push to Docker Hub or another registry, ensure credentials and repo are configured.'
        // Uncomment and adjust below if you want to push. Jenkins will need docker login or credentials.
        // sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS'
        // sh 'docker tag ${IMAGE} mycompany/5g-handover-ai:latest'
        // sh 'docker push mycompany/5g-handover-ai:latest'
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        echo 'Applying K8s manifests using a temporary kubectl container (kubeconfig must be mounted into Jenkins).'
        sh """
          docker run --rm -v /root/.kube/config:/root/.kube/config -v ${WORK}:/workspace bitnami/kubectl:latest \
            apply -f /workspace/deployment.yaml
        """
        sh """
          docker run --rm -v /root/.kube/config:/root/.kube/config bitnami/kubectl:latest \
            rollout status deployment/handover-ai-deployment --timeout=120s
        """
      }
    }
  }

  post {
    success { echo "Pipeline finished successfully." }
    failure { echo "Pipeline failed — check console output." }
  }
}