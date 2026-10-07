import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | NEXCUT AI",
  description: "Terms for using NEXCUT AI and its AI-assisted media tools.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <section><h2>1. About these terms</h2><p>These terms govern your use of NEXCUT AI, the public service and operator display name used here. By using the service, you agree to these terms. If you do not agree, do not use the service.</p></section>
      <section><h2>2. The service</h2><p>NEXCUT AI provides tools for working with video and audio, including AI-assisted analysis, transcription, clip preparation, subtitles, editing, and export. Available features may depend on account access, configuration, and the stage of development. Beta features may be incomplete or change.</p></section>
      <section><h2>3. Accounts and responsible use</h2><p>Provide accurate account information and protect access to your account. Use only content you own or have permission to process. You are responsible for respecting copyright, privacy, publicity rights, and applicable laws.</p><p>Do not use the service for unlawful or abusive content, impersonation, infringement, unauthorized access, evasion of security controls, or interference with the service or third-party systems.</p></section>
      <section><h2>4. Your content and AI-assisted output</h2><p>You retain the rights you hold in content you provide. These terms do not transfer ownership of that content to NEXCUT AI. You permit the processing and transmission necessary to provide the features you request, as described in our Privacy Policy.</p><p>AI-assisted output may contain errors, omissions, unsuitable material, or material similar to other content. We do not promise accuracy, uniqueness, non-infringement, or fitness for a particular purpose. Review output and confirm the rights and permissions needed before using or publishing it.</p></section>
      <section><h2>5. Third-party platforms and publishing</h2><p>Third-party authentication, processing, and platform features are also subject to those providers&apos; applicable terms and policies. Availability and permissions may change independently of NEXCUT AI.</p><p>Where an export or platform transfer feature is available, you are responsible for the destination, content, settings, and authorization you select. Connecting an account is not blanket consent to autonomous publication.</p><p>TikTok integration is in preparation and is not currently represented as an active production publishing service. Any supported TikTok authorization or publication must follow user direction and applicable review and consent requirements. NEXCUT AI is separate from TikTok and does not control TikTok&apos;s services.</p></section>
      <section><h2>6. Service availability and suspension</h2><p>We may change, restrict, suspend, or discontinue features, including for maintenance, security, legal requirements, or misuse. We may suspend access where reasonably necessary to protect users, third parties, or the service.</p></section>
      <section><h2>7. Disclaimers and limitations</h2><p>To the extent permitted by applicable law, the service is provided as available without warranties of uninterrupted operation or error-free results. Do not rely on it as your only copy of important content.</p><p>To the extent permitted by applicable law, NEXCUT AI is not responsible for indirect or consequential losses arising from use of the service, including losses caused by reliance on AI output or third-party platform decisions. Nothing in these terms excludes rights or liability that applicable law does not allow to be excluded.</p></section>
      <section><h2>8. Changes and contact</h2><p>We may update these terms and publish the revised version with an updated date. Review them periodically. Material changes will be communicated where appropriate. For legal inquiries or account and data deletion requests, contact <a href="mailto:nexcut.ai@gmail.com">nexcut.ai@gmail.com</a>.</p></section>
    </LegalPage>
  );
}
