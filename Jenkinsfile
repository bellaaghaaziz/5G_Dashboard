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
      }
    }

    stage('Build Docker Image') {
      steps {
        echo 'Building Docker image on host daemon...'
        // list workspace inside the docker-cli container and build using explicit Dockerfile path + context
        sh """
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v ${WORK}:/workspace docker:24.0.5-cli \
            sh -c "ls -la /workspace || true && echo ---- build ---- && docker build -t ${IMAGE} -f /workspace/Dockerfile /workspace"
        """
      }
    }

    stage('AI Validation & Testing') {
      steps {
        echo 'Running tests inside the built Docker image...'
        // run tests inside the image (image must include python + test deps)
        sh """
          docker run --rm -v ${WORK}:/workspace -w /workspace ${IMAGE} \
            sh -c "python test_models.py"
        """
      }
    }

    stage('Push to Docker Registry (optional)') {
      steps {
        echo 'Push disabled by default. Configure credentials and uncomment push steps if needed.'
        // Example push (uncomment & configure credentials if you want)
        // sh "docker tag ${IMAGE} mycompany/5g-handover-ai:latest"
        // sh "docker login -u $DOCKER_USER -p $DOCKER_PASS"
        // sh "docker push mycompany/5g-handover-ai:latest"
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        echo 'Applying K8s manifests using a temporary kubectl container.'
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