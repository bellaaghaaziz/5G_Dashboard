pipeline {
  agent any

  environment {
    IMAGE      = "5g-handover-ai:latest"
    // Set to your Docker Hub username to enable push, e.g. IMAGE_REMOTE = "youruser/5g-handover-ai"
    IMAGE_REMOTE = ""
  }

  stages {

    // ─────────────────────────────────────────────────────────────────────
    // 1. PREPARE
    //    Print environment info so failed builds are easier to debug.
    // ─────────────────────────────────────────────────────────────────────
    stage('Prepare') {
      steps {
        echo "Workspace : ${env.WORKSPACE}"
        echo "Branch    : ${env.GIT_BRANCH}"
        echo "Commit    : ${env.GIT_COMMIT}"
        sh 'ls -la'
        // Warn loudly if stale old-model files are still present
        script {
          def staleFiles = [
            'model_dso1_drop.pkl',
            'model_dso2_gain.pkl',
            'model_dso3_cluster.pkl',
            'model_dso4_master.pkl',
          ]
          staleFiles.each { f ->
            if (fileExists(f)) {
              echo "⚠️  WARNING: stale model file '${f}' found. " +
                   "Delete it — app.py uses the new filenames."
            }
          }
          // Abort if test_models.py is missing — there is no point building
          // an image that skips all validation.
          if (!fileExists('test_models.py')) {
            error("test_models.py not found. Add it before running the pipeline.")
          }
          // Abort if model_feature_lists.json is missing
          if (!fileExists('model_feature_lists.json')) {
            error("model_feature_lists.json not found. Re-run the notebook Phase 4 export cell.")
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. BUILD DOCKER IMAGE
    // ─────────────────────────────────────────────────────────────────────
    stage('Build Docker Image') {
      steps {
        sh 'docker build -t ${IMAGE} .'
        echo "✅ Docker image built: ${IMAGE}"
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. AI VALIDATION & TESTING
    //    Runs test_models.py INSIDE the built image so the test environment
    //    is identical to production. Exit code 1 = pipeline halts.
    // ─────────────────────────────────────────────────────────────────────
    stage('AI Validation & Testing') {
      steps {
        sh '''
          docker run --rm \
            -v ${WORKSPACE}:/workspace \
            -w /workspace \
            ${IMAGE} \
            python test_models.py
        '''
        echo "✅ All model validation tests passed."
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. PUSH TO DOCKER REGISTRY
    //    Uncomment the credential block and set IMAGE_REMOTE above to enable.
    // ─────────────────────────────────────────────────────────────────────
    stage('Push to Docker Registry') {
      steps {
        script {
          if (env.IMAGE_REMOTE?.trim()) {
            echo "Pushing to registry as ${IMAGE_REMOTE}…"
            withCredentials([usernamePassword(
                credentialsId: 'dockerhub-creds',
                usernameVariable: 'DOCKER_USER',
                passwordVariable: 'DOCKER_PASS')]) {
              sh """
                echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin
                docker tag ${IMAGE} ${IMAGE_REMOTE}:latest
                docker tag ${IMAGE} ${IMAGE_REMOTE}:${env.GIT_COMMIT?.take(8) ?: 'unknown'}
                docker push ${IMAGE_REMOTE}:latest
                docker push ${IMAGE_REMOTE}:${env.GIT_COMMIT?.take(8) ?: 'unknown'}
              """
            }
          } else {
            echo "IMAGE_REMOTE not set — push skipped. " +
                 "Set IMAGE_REMOTE and add 'dockerhub-creds' in Jenkins Credentials to enable."
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. DEPLOY TO KUBERNETES
    // ─────────────────────────────────────────────────────────────────────
    stage('Deploy to Kubernetes') {
      steps {
        script {
          def kubectlAvailable = sh(script: 'which kubectl', returnStatus: true) == 0
          if (!kubectlAvailable) {
            echo "kubectl not found on this agent — skipping Kubernetes deploy. " +
                 "Install kubectl or configure a kubectl Jenkins plugin."
          } else if (!fileExists('deployment.yaml')) {
            echo "deployment.yaml not found — skipping deploy."
          } else {
            sh 'kubectl apply -f deployment.yaml'
            sh 'kubectl rollout status deployment/handover-ai-deployment --timeout=120s'
            echo "✅ Kubernetes deployment succeeded."
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST-BUILD ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  post {
    success {
      echo "✅ Pipeline finished successfully."
      echo "   Image: ${IMAGE}"
      echo "   Commit: ${env.GIT_COMMIT}"
    }
    failure {
      echo "❌ Pipeline FAILED — check the console output above."
      echo "   Most likely causes:"
      echo "     1. test_models.py reported a failing test"
      echo "     2. Docker build error (check requirements.txt)"
      echo "     3. Kubernetes rollout timed out"
    }
    always {
      // Clean up dangling test containers (safety net)
      sh 'docker container prune -f || true'
    }
  }
}