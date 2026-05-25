import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import React from "react";

interface WelcomeEmailProps {
  /** Origin where the user can sign in. Threaded from the runtime so dev
   * previews link to localhost and prod links to the canonical alias. */
  signInUrl: string;
}

const paragraphStyle = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#0A0A0A",
  margin: "0 0 16px",
} as const;

export function WelcomeEmail({ signInUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Built for the antithesis — the other half of the conversation.
      </Preview>
      <Body
        style={{
          background: "#F5F4F2",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            background: "#FFFFFF",
            borderRadius: 18,
            border: "1px solid #E5E5E5",
            maxWidth: 560,
            margin: "0 auto",
            padding: "40px 36px",
          }}
        >
          <Heading
            as="h1"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 32,
              fontWeight: 500,
              color: "#0A0A0A",
              margin: "0 0 24px",
              lineHeight: 1.2,
            }}
          >
            Welcome to Altree.
          </Heading>

          <Text style={paragraphStyle}>
            You signed up, which means you&apos;ve probably noticed the same
            thing we have: most &ldquo;investment ideas&rdquo; you see in the
            wild are just the consensus, reheated. AI everywhere. Magnificent
            Seven. Whatever Cramer said this morning. By the time it&apos;s a
            headline, it&apos;s already a crowded trade.
          </Text>

          <Text style={paragraphStyle}>
            Altree is built for the other half of the conversation — the
            antithesis. The under-covered tickers, the second-order plays,
            the writers who were early on the cracks. When the consensus is
            unanimous, the opportunity is usually on the other side.
          </Text>

          <Text style={paragraphStyle}>
            Here&apos;s how to get started in the next 5 minutes:
          </Text>

          <Text style={paragraphStyle}>
            <strong>1. Paste an article.</strong> Bloomberg, the Economist,
            your favourite Substack — anything that made you think &ldquo;huh,
            interesting.&rdquo; We&apos;ll pull the theme, the global tickers
            (yes, beyond the S&amp;P), and what our curated panel of
            independent writers say — bull and bear.
          </Text>

          <Text style={paragraphStyle}>
            <strong>2. Or browse a theme.</strong> Japan corporate reform.
            GLP-1 second-order effects. India infra. The AI antithesis trade.
            Pick one. Read both sides. See the tickers.
          </Text>

          <Text style={paragraphStyle}>
            <strong>3. When you&apos;re ready to act,</strong> we hand off
            cleanly to platforms like Endowus, so you can express the view via
            thematic portfolios — no juggling tickers across five tabs.
          </Text>

          <Section style={{ margin: "8px 0 24px" }}>
            <Link
              href={signInUrl}
              style={{
                background: "#0A0A0A",
                color: "#FFFFFF",
                borderRadius: 9999,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open Altree →
            </Link>
          </Section>

          <Hr style={{ borderColor: "#E5E5E5", margin: "8px 0 24px" }} />

          <Text style={{ ...paragraphStyle, fontWeight: 600 }}>
            A few house rules:
          </Text>

          <Text style={paragraphStyle}>
            <strong>We don&apos;t give advice.</strong> We surface ideas and
            the arguments around them. You make the call.
          </Text>

          <Text style={paragraphStyle}>
            <strong>We won&apos;t email you every day.</strong> Roughly weekly
            — when there&apos;s a theme worth your attention.
          </Text>

          <Text style={{ ...paragraphStyle, margin: 0 }}>
            <strong>Reply to this email if you want to.</strong> A human
            reads it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;
