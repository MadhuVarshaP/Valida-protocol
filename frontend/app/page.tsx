"use client";

import React from "react";
import { useWallet } from "@/context/WalletContext";
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Database,
  Globe,
  Workflow,
  Fingerprint,
  FileText,
  FlaskConical,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/UI";
import { motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function LandingPage() {
  const { isLoading, isConnected, address } = useWallet();

  const pillars = [
    {
      icon: Lock,
      title: "Zero-Trust Integrity",
      description: "Each patch is pinned, hashed, and validated against on-chain integrity before installation."
    },
    {
      icon: Workflow,
      title: "Controlled Rollout",
      description: "Admin, publisher, and device roles keep release governance strict and traceable."
    },
    {
      icon: Database,
      title: "Audit-Ready Trail",
      description: "Installation lifecycle is mirrored in backend logs with chain-linked transaction metadata."
    }
  ];

  const flow = [
    { icon: Fingerprint, title: "Authorize", text: "Admin authorizes publishers and registers devices on-chain." },
    { icon: FileText, title: "Publish", text: "Publisher uploads artifact to IPFS and commits hash + metadata on-chain." },
    { icon: ShieldCheck, title: "Verify", text: "Device compares downloaded hash with blockchain state before install." },
    { icon: Globe, title: "Report", text: "Installation status is written on-chain and synced to backend analytics." }
  ];

  return (
    <div className="min-h-screen bg-[#EDEDED] text-[#1A1A1A] relative overflow-hidden font-dm-sans selection:bg-[#1A1A1A] selection:text-[#A9FD5F]">
      {/* Soft viewport glow using radial gradient */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_#ffffff_0%,_#e8eaeb_100%)] opacity-80 pointer-events-none" />

      {/* Top Navigation */}
      <nav className="w-full flex items-center justify-between px-6 sm:px-12 py-8 max-w-[1400px] mx-auto relative z-30">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-7 md:h-10 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="text-xl md:text-2xl font-black tracking-tight text-[#1A1A1A]">BPMS</span>
        </div>

        {/* <div className="hidden lg:flex items-center gap-10">
          <span className="text-[15px] font-medium hover:opacity-60 cursor-pointer transition-opacity">Networks</span>
          <span className="text-[15px] font-medium hover:opacity-60 cursor-pointer transition-opacity">Selection</span>
          <span className="text-[15px] font-medium hover:opacity-60 cursor-pointer transition-opacity">Reliability</span>
          <span className="text-[15px] font-medium hover:opacity-60 cursor-pointer transition-opacity">Get in Touch</span>
        </div> */}

        <div className="flex items-center gap-4">
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && !!account && !!chain;

              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    isLoading={isLoading}
                    className="text-[14px] font-bold px-8 py-5 rounded-full border border-[#1A1A1A] bg-white text-[#1A1A1A] hover:bg-[#A9FD5F] hover:scale-[1.03] transition-all flex items-center shadow-none hover:shadow-none"
                  >
                    Connect Wallet
                  </Button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={openChainModal}
                    variant="outline"
                    className="text-[13px] font-bold px-6 py-4 rounded-full border-2 border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A]/5 transition-colors hidden sm:flex"
                  >
                    {chain.name}
                  </Button>
                  <Button
                    onClick={openAccountModal}
                    className="text-[13px] font-bold px-6 py-4 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 transition-colors shadow-lg"
                  >
                    {account.displayName}
                  </Button>
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </nav>

      <div className="relative z-10 w-full flex flex-col items-center justify-center pt-4 sm:pt-8 pb-16 px-4 sm:px-6">

        {/* Hero Section Container mimicking Moonli.me's pill/card */}
        <section className="w-full max-w-[1200px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[40px] md:rounded-[60px] bg-[#A9FD5F] py-24 px-4 sm:px-10 flex flex-col items-center justify-center text-center relative overflow-visible shadow-[0_30px_60px_rgba(169,253,95,0.18)]"
          >
            {/* Corner SVGs */}
            <img
              src="/hero1.svg"
              alt="Decoration"
              className="absolute -top-6 -left-6 md:-top-10 md:-left-20 w-[160px] md:w-[220px] object-contain opacity-90 hidden sm:block mix-blend-multiply pointer-events-none z-10"
            />
            <img
              src="/hero4.svg"
              alt="Decoration"
              className="absolute -top-6 -right-6 md:-top-8 md:-right-25 w-[240px] md:w-[300px] object-contain opacity-90 hidden sm:block mix-blend-multiply pointer-events-none z-20"
            />
            <img
              src="/hero3.svg"
              alt="Decoration"
              className="absolute -bottom-0 -left-6 md:-bottom-5 md:-left-16 w-[210px] md:w-[260px] object-contain opacity-90 hidden sm:block mix-blend-multiply pointer-events-none z-20"
            />
            <img
              src="/hero2.svg"
              alt="Decoration"
              className="absolute -bottom-0 -right-6 md:-bottom-[-20px] md:-right-16 w-[220px] md:w-[280px] object-contain opacity-90 hidden sm:block -scale-x-100 mix-blend-multiply pointer-events-none z-20" />

            {/* Replaced Headline with the user requested text */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-[44px] sm:text-5xl md:text-6xl lg:text-[68px] tracking-[-0.035em] leading-[1.02] text-[#1A1A1A] max-w-[850px] mb-8 font-medium relative z-10"
            >
              We secure <span className="font-bold">every update</span> before it reaches your system.<br />
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-lg sm:text-xl md:text-2xl text-[#1A1A1A]/85 max-w-3xl leading-[1.6] mb-12 font-medium relative z-10 px-4"
            >
              Trust is <span className="font-bold bg-white px-2 rounded-md">verified</span>, not assumed. BPMS combines role-governed patch publishing and on-chain integrity checks.
            </motion.p>

            {/* Down Arrow overlap */}
            <div className="absolute left-[50%] bottom-0 -translate-x-[50%] translate-y-[50%] z-20">
              <motion.div
                whileHover={{ y: 5 }}
                className="w-16 h-16 md:w-20 md:h-20 bg-[#1A1A1A] rounded-full flex items-center justify-center cursor-pointer shadow-lg border-[6px] border-[#EDEDED] transition-transform"
                onClick={() => window.scrollTo({ top: window.innerHeight * 0.8, behavior: 'smooth' })}
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-6 h-6 md:w-8 md:h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* Text Block directly below the Hero container mimicking the website's flow */}
        <section className="w-full max-w-[900px] mt-24 mb-10 px-6 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#1A1A1A] leading-[1.2]"
          >
            Still trusting updates blindly?<br className="hidden sm:block" />
            Why not <span className="font-bold relative inline-block text-white px-3 py-1 bg-[#1A1A1A] rounded-xl shadow-lg -rotate-2 hover:rotate-0 transition-transform duration-300">verify</span> every single one?
          </motion.h2>
        </section>

        {/* Pillars Section */}
        <section className="w-full max-w-[1240px] mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {pillars.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-[32px] border border-[#1A1A1A]/5 bg-white p-10 hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-all duration-500 flex flex-col group relative overflow-hidden"
              >
                <div className="bg-transparent border border-[#1A1A1A]/10 w-14 h-14 rounded-full flex items-center justify-center text-[#1A1A1A] mb-8 group-hover:bg-[#A9FD5F] group-hover:border-transparent transition-colors duration-300">
                  <item.icon size={24} strokeWidth={2} />
                </div>
                <h3 className="text-[22px] font-bold tracking-tight mb-4 text-[#1A1A1A]">{item.title}</h3>
                <p className="text-[16px] text-[#1A1A1A]/60 leading-[1.7] font-medium">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Lifecycle Flow Section */}
        <section className="w-full max-w-[1240px] mt-16">
          <div className="rounded-[40px] border border-[#1A1A1A]/5 bg-white p-10 md:p-16 lg:p-20 relative overflow-hidden">
            <div className="flex items-center gap-4 mb-12 border-b border-[#1A1A1A]/5 pb-10">
              <div className="bg-[#A9FD5F] p-4 rounded-full text-[#1A1A1A] shadow-md">
                <Fingerprint size={28} strokeWidth={2} />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1A1A1A]">Lifecycle Flow</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
              {flow.map((step, idx) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: idx % 2 === 0 ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col group"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="border border-[#1A1A1A]/10 w-12 h-12 flex items-center justify-center rounded-2xl text-[#1A1A1A] group-hover:bg-[#1A1A1A] group-hover:text-white transition-colors duration-300">
                      <step.icon size={20} strokeWidth={2} />
                    </div>
                    <p className="text-[22px] font-black tracking-tight text-[#1A1A1A]">{step.title}</p>
                  </div>
                  <p className="text-[16px] text-[#1A1A1A]/70 leading-[1.65] font-medium pl-16 opacity-90">{step.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Links Section */}
        <section className="w-full max-w-[1240px] mt-16 mb-8 text-center pb-8 border-b border-[#1A1A1A]/5">
          <p className="text-[13px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/40 mb-10">Resources & Documentation</p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { icon: FlaskConical, label: "Demo video", href: "https://youtu.be/AoJstWllhmE" },
              { icon: FileText, label: "IEEE Paper", href: "/Blockchain-Based%20Patch%20Management%20System-1.pdf" },
              // { icon: ExternalLink, label: "Technical Docs" }
            ].map((link, idx) => (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="flex items-center gap-3 px-8 py-5 rounded-full border border-[#1A1A1A]/10 bg-white hover:border-[#1A1A1A]/30 transition-colors cursor-pointer group hover:-translate-y-1 duration-300 shadow-sm hover:shadow-md"
                onClick={() => {
                  window.open(link.href, "_blank", "noopener,noreferrer");
                }}
              >
                <link.icon size={20} className="text-[#1A1A1A]/60 group-hover:text-[#A9FD5F] transition-colors" />
                <span className="text-[15px] font-bold text-[#1A1A1A] group-hover:text-[#1A1A1A] transition-colors">{link.label}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
