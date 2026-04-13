import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('ALAnalytics')
export class ALAnalytics extends Component {

    private static send(eventName: string) {
        if (typeof (window as any).ALPlayableAnalytics !== 'undefined') {
            (window as any).ALPlayableAnalytics.trackEvent(eventName);
            console.log("AL Event Sent:", eventName);
        }
    }

    // Loading Events
    static loading() {
        this.send("LOADING");
    }

    static loaded() {
        this.send("LOADED");
    }

    static displayed() {
        this.send("DISPLAYED");
    }

    // Challenge Events
    static challengeStarted() {
        this.send("CHALLENGE_STARTED");
    }

    static challengePass25() {
        this.send("CHALLENGE_PASS_25");
    }

    static challengePass50() {
        this.send("CHALLENGE_PASS_50");
    }

    static challengePass75() {
        this.send("CHALLENGE_PASS_75");
    }

    static challengeSolved() {
        this.send("CHALLENGE_SOLVED");
    }

    static challengeFailed() {
        this.send("CHALLENGE_FAILED");
    }

    static challengeRetry() {
        this.send("CHALLENGE_RETRY");
    }

    // Completion Events
    static endcardShown() {
        this.send("ENDCARD_SHOWN");
    }

    static ctaClicked() {
        this.send("CTA_CLICKED");
    }
}