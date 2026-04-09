pipeline {
  agent any

  environment {
    IMAGE = "5g-handover-ai:latest"
  }

  stages {

    // ------------------------------------------------------------------ //
    // 1. PREPARE — confirm the workspace actually has your files
    // ------------------------------------------------------------------ //
    stage('Prepare') {
      steps {
        echo "Workspace: ${env.WORKSPACE}"
        sh 'ls -la'          // will print every file Jenkins checked out
      }
    }

    // ------------------------------------------------------------------ //
    // 2. BUILD — call docker directly, no docker-in-docker wrapper
    //    The old approach mounted ${WORKSPACE} from inside the Jenkins
    //    container, which maps to an EMPTY path on the host → empty build
    //    context → "no such file: Dockerfile".
    //    Fix: call docker build straight from the Jenkins agent where the
    //    workspace already exists as a real directory.
    // ------------------------------------------------------------------ //
    stage('Build Docker Image') {
      steps {
        sh 'docker build -t ${IMAGE} .'
      }
    }

    // ------------------------------------------------------------------ //
    // 3. TEST — run the container and execute your test script
    //    If you don't have test_models.py yet the stage is skipped safely.
    // ------------------------------------------------------------------ //
    stage('AI Validation & Testing') {
      steps {
        script {
          def hasTests = fileExists('test_models.py')
          if (hasTests) {
            sh 'docker run --rm -v ${WORKSPACE}:/workspace -w /workspace ${IMAGE} python test_models.py'
          } else {
            echo 'No test_models.py found — skipping tests.'
          }
        }
      }
    }

    // ------------------------------------------------------------------ //
    // 4. PUSH — disabled by default, uncomment + add Jenkins credentials
    //    to enable.  In Jenkins UI: Manage Jenkins → Credentials → add a
    //    "Username with password" credential with id = "dockerhub-creds"
    // ------------------------------------------------------------------ //
    stage('Push to Docker Registry') {
      steps {
        echo 'Push is disabled. To enable: uncomment the block below and'
        echo 'add a Jenkins credential with id = dockerhub-creds.'
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

    // ------------------------------------------------------------------ //
    // 5. DEPLOY — applies deployment.yaml if it exists.
    //    Requires kubectl installed on the Jenkins agent AND a valid
    //    kubeconfig at ~/.kube/config (or KUBECONFIG env var set).
    // ------------------------------------------------------------------ //
    stage('Deploy to Kubernetes') {
      steps {
        script {
          def hasManifest = fileExists('deployment.yaml')
          if (hasManifest) {
            sh 'kubectl apply -f deployment.yaml'
            sh 'kubectl rollout status deployment/handover-ai-deployment --timeout=120s'
          } else {
            echo 'No deployment.yaml found — skipping Kubernetes deploy.'
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
