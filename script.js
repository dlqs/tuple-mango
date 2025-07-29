class FlashcardApp {
    constructor() {
        this.flashcards = [];
        this.currentIndex = 0;
        this.session = {
            correct: 0,
            total: 0,
            answered: new Set()
        };
        this.isAnswerRevealed = false;
        
        this.initializeApp();
    }

    initializeApp() {
        // Check if Web Crypto API is available
        if (!crypto || !crypto.subtle) {
            this.showCryptoError();
            return;
        }
        
        this.bindEvents();
        this.showScreen('password-screen');
    }

    showCryptoError() {
        const errorHtml = `
            <div class="screen active">
                <div class="container">
                    <div class="logo">
                        <h1>🔒 HTTPS Required</h1>
                        <p>This app requires a secure connection to work properly.</p>
                    </div>
                    <div class="password-form">
                        <h3>Please access this site via:</h3>
                        <ul style="text-align: left; margin: 20px 0;">
                            <li><strong>HTTPS</strong> (e.g., https://practice.dlqs.xyz)</li>
                            <li><strong>Localhost</strong> (e.g., http://localhost:8080)</li>
                        </ul>
                        <p>The Web Crypto API requires a secure context for encryption/decryption.</p>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('app').innerHTML = errorHtml;
    }

    bindEvents() {
        // Password form
        document.getElementById('password-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePasswordSubmit();
        });

        // Choice buttons (delegated event)
        document.getElementById('choices').addEventListener('click', (e) => {
            if (e.target.classList.contains('choice-btn')) {
                this.handleChoiceClick(e.target);
            }
        });

        // Navigation buttons
        document.getElementById('next-btn').addEventListener('click', () => this.nextCard());
        document.getElementById('prev-btn').addEventListener('click', () => this.previousCard());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartSession());
        document.getElementById('shuffle-btn').addEventListener('click', () => this.shuffleCards());
    }

    async handlePasswordSubmit() {
        const password = document.getElementById('password-input').value;
        const unlockBtn = document.getElementById('unlock-btn');
        const errorMessage = document.getElementById('error-message');
        
        // Show loading state
        unlockBtn.disabled = true;
        document.querySelector('.btn-text').classList.add('hidden');
        document.querySelector('.btn-loading').classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            this.showScreen('loading-screen');
            await this.decryptFlashcards(password);
            this.initializeSession();
            this.showScreen('flashcard-screen');
        } catch (error) {
            console.error('Decryption failed:', error);
            this.showScreen('password-screen');
            errorMessage.textContent = 'Incorrect password. Please try again.';
            errorMessage.classList.remove('hidden');
        } finally {
            // Reset button state
            unlockBtn.disabled = false;
            document.querySelector('.btn-text').classList.remove('hidden');
            document.querySelector('.btn-loading').classList.add('hidden');
            document.getElementById('password-input').value = '';
        }
    }

    async decryptFlashcards(password) {
        try {
            console.log('Fetching encrypted data...');
            const response = await fetch(`data.json.enc?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Failed to load encrypted data: ${response.status}`);
            }
            
            const encryptedData = await response.arrayBuffer();
            console.log('Encrypted data size:', encryptedData.byteLength);
            
            console.log('Decrypting data...');
            const decryptedData = await this.decrypt(encryptedData, password);
            console.log('Decrypted data length:', decryptedData.length);
            console.log('Decrypted data starts with:', decryptedData.substring(0, 100));
            
            console.log('Parsing JSON...');
            const parsedData = JSON.parse(decryptedData);
            this.flashcards = parsedData.cards;
            
            if (!this.flashcards || !Array.isArray(this.flashcards) || this.flashcards.length === 0) {
                throw new Error('Invalid flashcard data');
            }
            
            console.log('Successfully loaded', this.flashcards.length, 'flashcards');
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error(`Failed to decrypt flashcards: ${error.message}`);
        }
    }

    async decrypt(encryptedData, password) {
        // Check if Web Crypto API is available
        if (!crypto || !crypto.subtle) {
            throw new Error('Web Crypto API not available. Please access this site over HTTPS.');
        }
        
        // Extract IV (first 16 bytes), auth tag (last 16 bytes), and encrypted data (middle)
        const iv = encryptedData.slice(0, 16);
        const authTag = encryptedData.slice(-16);
        const encrypted = encryptedData.slice(16, -16);
        
        const encoder = new TextEncoder();
        
        // Create key material from password
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        
        // Derive key using PBKDF2 (same parameters as Node.js)
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('flashcard-salt-2023'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        
        // Combine encrypted data with auth tag for AES-GCM
        const dataWithTag = new Uint8Array(encrypted.byteLength + authTag.byteLength);
        dataWithTag.set(new Uint8Array(encrypted), 0);
        dataWithTag.set(new Uint8Array(authTag), encrypted.byteLength);
        
        // Decrypt using AES-GCM
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            dataWithTag
        );
        
        // Convert decrypted bytes back to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    initializeSession() {
        // Shuffle the flashcards at the start of each session
        this.flashcards = this.shuffleArray(this.flashcards);
        
        this.currentIndex = 0;
        this.session = {
            correct: 0,
            total: 0,
            answered: new Set()
        };
        this.isAnswerRevealed = false;
        this.updateProgress();
        this.displayCurrentCard();
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    displayCurrentCard() {
        const card = this.flashcards[this.currentIndex];
        
        // Show question state
        document.getElementById('question-state').classList.add('active');
        document.getElementById('answer-state').classList.remove('active');
        this.isAnswerRevealed = false;
        
        // Update question text with syntax highlighting
        const questionElement = document.getElementById('question-text');
        questionElement.innerHTML = this.formatText(card.question);
        
        // Apply syntax highlighting to code blocks
        questionElement.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
        
        // Create shuffled choices with mapping to original indices
        const choicesWithIndices = card.choices.map((choice, index) => ({ choice, originalIndex: index }));
        const shuffledChoices = this.shuffleArray([...choicesWithIndices]);
        
        // Create choice buttons with shuffled order
        const choicesContainer = document.getElementById('choices');
        choicesContainer.innerHTML = '';
        
        shuffledChoices.forEach((item, shuffledIndex) => {
            const button = document.createElement('button');
            button.className = 'choice-btn';
            button.dataset.originalIndex = item.originalIndex;
            button.dataset.shuffledIndex = shuffledIndex;
            button.textContent = item.choice;
            choicesContainer.appendChild(button);
        });
        
        // Store the correct answer's new position for later reference
        this.currentCorrectIndex = shuffledChoices.findIndex(item => item.originalIndex === card.correct);
        
        // Update navigation buttons
        document.getElementById('prev-btn').disabled = this.currentIndex === 0;
        
        this.updateProgress();
    }

    handleChoiceClick(button) {
        if (this.isAnswerRevealed) return;
        
        // Remove previous selections
        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Mark selected choice
        button.classList.add('selected');
        
        // Process answer after short delay for visual feedback
        setTimeout(() => {
            this.processAnswer(parseInt(button.dataset.originalIndex), parseInt(button.dataset.shuffledIndex));
        }, 200);
    }

    processAnswer(selectedOriginalIndex, selectedShuffledIndex) {
        const card = this.flashcards[this.currentIndex];
        const isCorrect = selectedOriginalIndex === card.correct;
        
        // Update session stats
        if (!this.session.answered.has(this.currentIndex)) {
            this.session.total++;
            if (isCorrect) {
                this.session.correct++;
            }
            this.session.answered.add(this.currentIndex);
        }
        
        // Mark correct and incorrect answers based on shuffled positions
        const choiceButtons = document.querySelectorAll('.choice-btn');
        choiceButtons.forEach((btn, shuffledIndex) => {
            btn.disabled = true;
            if (shuffledIndex === this.currentCorrectIndex) {
                btn.classList.add('correct');
            } else if (shuffledIndex === selectedShuffledIndex && !isCorrect) {
                btn.classList.add('incorrect');
            }
        });
        
        // Show answer state
        setTimeout(() => {
            this.showAnswer(isCorrect, card.explanation);
        }, 800);
    }

    showAnswer(isCorrect, explanation) {
        this.isAnswerRevealed = true;
        
        // Update result indicator
        const resultIndicator = document.querySelector('.result-indicator');
        const resultIcon = document.getElementById('result-icon');
        const resultText = document.getElementById('result-text');
        
        if (isCorrect) {
            resultIndicator.className = 'result-indicator correct';
            resultIcon.textContent = '✅';
            resultText.textContent = 'Correct!';
        } else {
            resultIndicator.className = 'result-indicator incorrect';
            resultIcon.textContent = '❌';
            resultText.textContent = 'Incorrect';
        }
        
        // Show explanation
        const explanationElement = document.getElementById('explanation-text');
        explanationElement.innerHTML = this.formatText(explanation);
        
        // Apply syntax highlighting to code blocks in explanation
        explanationElement.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
        
        // Switch to answer state
        document.getElementById('question-state').classList.remove('active');
        document.getElementById('answer-state').classList.add('active');
        
        this.updateProgress();
    }

    nextCard() {
        if (this.currentIndex < this.flashcards.length - 1) {
            this.currentIndex++;
            this.displayCurrentCard();
        } else {
            this.showCompletionScreen();
        }
    }

    showCompletionScreen() {
        const percentage = this.session.total > 0 ? Math.round((this.session.correct / this.session.total) * 100) : 0;
        
        document.getElementById('question-state').classList.remove('active');
        document.getElementById('answer-state').classList.add('active');
        
        const resultIndicator = document.querySelector('.result-indicator');
        const resultIcon = document.getElementById('result-icon');
        const resultText = document.getElementById('result-text');
        const explanationElement = document.getElementById('explanation-text');
        const nextBtn = document.getElementById('next-btn');
        
        resultIndicator.className = 'result-indicator';
        resultIcon.textContent = '🎉';
        resultText.textContent = 'Complete!';
        
        explanationElement.innerHTML = `
            <div style="text-align: center;">
                <h3>All flashcards completed!</h3>
                <p>Final Score: <strong>${this.session.correct}/${this.session.total} (${percentage}%)</strong></p>
                <p>Great job studying! 📚</p>
            </div>
        `;
        
        nextBtn.textContent = '🔄 Start Over';
        nextBtn.onclick = () => this.restartSession();
    }

    previousCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrentCard();
        }
    }

    shuffleArray(array) {
        // Fisher-Yates shuffle
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    shuffleCards() {
        // Fisher-Yates shuffle
        for (let i = this.flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.flashcards[i], this.flashcards[j]] = [this.flashcards[j], this.flashcards[i]];
        }
        
        this.currentIndex = 0;
        this.displayCurrentCard();
    }

    restartSession() {
        this.initializeSession();
    }

    updateProgress() {
        const cardCounter = document.getElementById('card-counter');
        const accuracy = document.getElementById('accuracy');
        
        cardCounter.textContent = `${this.currentIndex + 1} / ${this.flashcards.length}`;
        
        if (this.session.total > 0) {
            const percentage = Math.round((this.session.correct / this.session.total) * 100);
            accuracy.textContent = `${percentage}% correct (${this.session.correct}/${this.session.total})`;
        } else {
            accuracy.textContent = '0% correct';
        }
    }

    formatText(text) {
        // First convert escaped newlines to actual newlines
        text = text.replace(/\\n/g, '\n');
        
        // Convert markdown-style code blocks to HTML
        // Handle triple backtick code blocks (preserve newlines inside)
        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
            return `<pre><code class="language-${lang || ''}">${code}</code></pre>`;
        });
        
        // Then handle inline code (single backticks)
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Finally convert remaining newlines to <br> (but not inside code blocks)
        text = text.replace(/\n/g, '<br>');
        
        return text;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlashcardApp();
});