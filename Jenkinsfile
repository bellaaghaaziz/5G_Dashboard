pipeline {
  agent any

  environment {
    IMAGE = "5g-handover-ai:latest"
  }

  stages {

    stage('Prepare') {
      steps {
        echo "Workspace: ${env.WORKSPACE}"
        sh 'ls -la'
      }
    }

    stage('Build Docker Image') {
      steps {
        sh 'docker build -t ${IMAGE} .'
      }
    }

    stage('AI Validation & Testing') {
      steps {
        script {
          if (fileExists('test_models.py')) {
            sh 'docker run --rm -v ${WORKSPACE}:/workspace -w /workspace ${IMAGE} python test_models.py'
          } else {
            echo 'No test_models.py found — skipping tests.'
          }
        }
      }
    }

    stage('Push to Docker Registry') {
      steps {
        echo 'Push is disabled. Add dockerhub-creds in Jenkins to enable.'
        /*
        withCredentials([usernamePassword(
            credentialsId: 'dockerhub-creds',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {
          sh """
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
            docker tag ${IMAGE} ${DOCKER_USER}/5g-handover-ai:latest
            docker push ${DOCKER_USER}/5g-handover-ai:latest
          """
        }
        */
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        script {
          // Check kubectl exists before trying
          def kubectlAvailable = sh(script: 'which kubectl', returnStatus: true) == 0
          if (!kubectlAvailable) {
            echo 'kubectl not found on this agent — skipping deploy. Install it or configure a kubectl Jenkins plugin.'
          } else if (fileExists('deployment.yaml')) {
            sh 'kubectl apply -f deployment.yaml'
            sh 'kubectl rollout status deployment/handover-ai-deployment --timeout=120s'
          } else {
            echo 'No deployment.yaml found — skipping deploy.'
          }
        }
      }
    }

  }

  post {
    success { echo 'Pipeline finished successfully.' }
    failure  { echo 'Pipeline failed — check console output above.' }
  }
}