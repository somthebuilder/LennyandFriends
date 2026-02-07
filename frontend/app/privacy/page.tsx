'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Footer from '@/components/Footer'

export default function PrivacyPolicyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-charcoal-200/50 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-3 group"
            >
              <img 
                src="/panelchat-logo.svg" 
                alt="Panel Chat"
                className="h-8 w-auto transition-transform group-hover:scale-105 duration-300"
              />
            </button>
            <button
              onClick={() => router.back()}
              className="text-sm font-medium text-charcoal-700 hover:text-orange-600 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        <article className="bg-white rounded-2xl shadow-sm border border-charcoal-100 p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-charcoal-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-charcoal-500 mb-8">
            Last Updated: February 7, 2026
          </p>

          {/* Experimental Notice */}
          <div className="mb-8 p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg">
            <p className="text-sm font-semibold text-charcoal-900 mb-2">⚠️ Experimental Project Notice</p>
            <p className="text-sm text-charcoal-700 leading-relaxed">
              Panel Chat is a <strong>free, experimental, educational, and non-commercial project</strong> created for research and learning purposes. 
              All podcast content belongs to its original creators. Not affiliated with any podcast or creator.
            </p>
          </div>

          <div className="prose prose-charcoal max-w-none">
            {/* Introduction */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Introduction</h2>
              <p className="text-charcoal-700 leading-relaxed mb-4">
                Welcome to Panel Chat ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Panel Chat service (the "Service").
              </p>
            </section>

            {/* Information We Collect */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">1. Information You Provide Directly</h3>
              <p className="text-charcoal-700 mb-3">When you create an account or use our Service, we collect:</p>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li><strong>Name</strong>: Your full name for personalization</li>
                <li><strong>Email Address</strong>: Used for account authentication and communication</li>
                <li><strong>Password</strong>: Securely hashed and encrypted for account security</li>
                <li><strong>Company</strong> (Optional): Your company or organization name</li>
                <li><strong>Role</strong> (Optional): Your professional role or title</li>
              </ul>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">2. Usage Data</h3>
              <p className="text-charcoal-700 mb-3">When you interact with our Service, we automatically collect:</p>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li><strong>Queries and Conversations</strong>: Questions you ask the AI panel and responses generated</li>
                <li><strong>User Context</strong>: Information you provide about your interests, goals, and professional context</li>
                <li><strong>Authentication Data</strong>: Session tokens managed through Supabase Auth</li>
                <li><strong>Interaction Data</strong>: Which guest responses you click on, panels you view, and features you use</li>
              </ul>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">3. Technical Data</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li>Browser type and version</li>
                <li>Device type and operating system</li>
                <li>IP address (for security)</li>
                <li>Timestamps</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">How We Use Your Information</h2>
              
              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">1. Provide the Service</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li>Authenticate your account</li>
                <li>Generate personalized AI responses based on your context</li>
                <li>Enable group chat and split chat features</li>
              </ul>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">2. Improve the Service</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li>Analyze usage patterns to enhance features</li>
                <li>Debug technical issues</li>
                <li>Optimize AI response quality</li>
              </ul>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">3. Communication</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li>Send account-related notifications</li>
                <li>Respond to your inquiries</li>
                <li>Notify you of important updates</li>
              </ul>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">4. Security</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li>Protect against fraud and abuse</li>
                <li>Enforce our Terms of Service</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            {/* How We Share Your Information */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">How We Share Your Information</h2>
              <p className="text-charcoal-700 mb-4">
                <strong>We do not sell your personal information.</strong> We may share your information only in the following circumstances:
              </p>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">Service Providers</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li><strong>Supabase</strong>: For authentication, database storage, and hosting</li>
                <li><strong>AI Model Providers</strong> (Gemini/OpenAI): Your queries are sent to AI models to generate responses</li>
                <li><strong>Hosting Providers</strong>: For application deployment</li>
              </ul>
            </section>

            {/* Data Security */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Data Storage and Security</h2>
              
              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">Security Measures</h3>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700 mb-4">
                <li><strong>Encryption</strong>: All data transmitted is encrypted using HTTPS/TLS</li>
                <li><strong>Password Security</strong>: Passwords are hashed and salted</li>
                <li><strong>Authentication</strong>: Secure authentication managed through Supabase Auth</li>
                <li><strong>Row Level Security</strong>: Database access controlled through RLS policies</li>
              </ul>
            </section>

            {/* Your Rights */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Your Rights and Choices</h2>
              
              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">Access and Portability</h3>
              <p className="text-charcoal-700 mb-4">You can request a copy of your personal data at any time.</p>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">Correction</h3>
              <p className="text-charcoal-700 mb-4">You can update your account information through your account settings.</p>

              <h3 className="text-xl font-semibold text-charcoal-800 mb-3">Deletion</h3>
              <p className="text-charcoal-700 mb-4">
                You can request deletion of your account and associated data by contacting us at <a href="mailto:somshivanshu@gmail.com" className="text-orange-600 hover:underline">somshivanshu@gmail.com</a>
              </p>
            </section>

            {/* AI Content */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">AI-Generated Content</h2>
              <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4">
                <p className="text-charcoal-700 mb-2"><strong>Important:</strong></p>
                <ul className="list-disc pl-6 space-y-2 text-charcoal-700">
                  <li>Your queries are sent to AI model providers (Gemini, OpenAI) to generate responses</li>
                  <li>AI-generated responses may not be accurate</li>
                  <li>Responses should not be considered professional advice</li>
                  <li>All responses are grounded in publicly available podcast transcripts</li>
                </ul>
              </div>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Contact Information</h2>
              <p className="text-charcoal-700 mb-4">
                If you have questions or concerns about this Privacy Policy, please contact us at:
              </p>
              <p className="text-charcoal-700">
                <strong>Email:</strong> <a href="mailto:somshivanshu@gmail.com" className="text-orange-600 hover:underline">somshivanshu@gmail.com</a>
              </p>
            </section>

            {/* GDPR */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-charcoal-900 mb-4">Data Protection Rights (GDPR)</h2>
              <p className="text-charcoal-700 mb-4">
                If you are a resident of the European Economic Area (EEA), you have additional rights under GDPR:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-charcoal-700">
                <li>Right to access your personal data</li>
                <li>Right to rectification of inaccurate data</li>
                <li>Right to erasure ("right to be forgotten")</li>
                <li>Right to restrict processing</li>
                <li>Right to data portability</li>
                <li>Right to object to processing</li>
                <li>Right to withdraw consent</li>
              </ul>
            </section>

            {/* Summary */}
            <section className="bg-charcoal-50 rounded-lg p-6 border border-charcoal-200">
              <h2 className="text-xl font-bold text-charcoal-900 mb-4">Summary (TL;DR)</h2>
              
              <div className="space-y-4 text-charcoal-700">
                <div>
                  <p className="font-semibold mb-2">What we collect:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Name, email, company, role (you provide)</li>
                    <li>Your questions and conversations with AI</li>
                    <li>Basic usage data</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold mb-2">What we do with it:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Provide personalized AI responses</li>
                    <li>Improve the service</li>
                    <li>Keep your account secure</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold mb-2">What we DON&apos;T do:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Sell your data</li>
                    <li>Share with third parties (except service providers)</li>
                    <li>Track you across the web</li>
                    <li>Use advertising cookies</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold mb-2">Your rights:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Access your data</li>
                    <li>Delete your account</li>
                    <li>Opt out of communications</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  )
}

