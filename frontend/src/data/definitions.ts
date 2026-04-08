export interface Definition {
  title: string;
  description: string;
  category: 'phase' | 'concept' | 'metric';
  moreInfo?: string;
  links?: { label: string; url: string }[];
}

export const DEFINITIONS: Record<string, Definition> = {
  // KILL CHAIN PHASES
  'recon': {
    title: 'Reconnaissance',
    category: 'phase',
    description: 'The phase where adversaries gather information that can be used to plan future operations.',
    moreInfo: 'Adversaries may scan for vulnerabilities, identify public-facing assets, or search for information about employees or organization structure.',
  },
  'resource': {
    title: 'Resource Development',
    category: 'phase',
    description: 'Adversaries create, purchase, or steal resources that can be used to support their attack.',
    moreInfo: 'This includes acquiring infrastructure like virtual private servers (VPS), code signing certificates, or domain names.',
  },
  'initial': {
    title: 'Initial Access',
    category: 'phase',
    description: 'The techniques adversaries use to gain a foothold within your network.',
    moreInfo: 'Common methods include phishing, exploiting public-facing applications, or using external remote services.',
  },
  'execution': {
    title: 'Execution',
    category: 'phase',
    description: 'Techniques that result in adversary-controlled code running on a local or remote system.',
    moreInfo: 'This often involves running a command-line interface, using PowerShell, or tricking a user into clicking a malicious file.',
  },
  'persistence': {
    title: 'Persistence',
    category: 'phase',
    description: 'Techniques used to maintain access to systems across restarts or changed credentials.',
    moreInfo: 'Adversaries may modify startup folders, registry keys, or create new scheduled tasks.',
  },
  'privesc': {
    title: 'Privilege Escalation',
    category: 'phase',
    description: 'Techniques used to gain higher-level permissions on a system or network.',
    moreInfo: 'Adversaries often enter a system with low privileges and need to escalate to "System" or "Admin" to achieve their goals.',
  },
  'defense': {
    title: 'Defense Evasion',
    category: 'phase',
    description: 'Techniques used to avoid detection throughout an attack.',
    moreInfo: 'This includes hiding malicious code, disabling security tools, or mimicking legitimate system processes.',
  },
  'cred': {
    title: 'Credential Access',
    category: 'phase',
    description: 'Techniques used to steal credentials like account names and passwords.',
    moreInfo: 'Adversaries may use keyloggers, credential dumping, or brute-force attacks.',
  },
  'discovery': {
    title: 'Discovery',
    category: 'phase',
    description: 'The process of gaining knowledge about the internal network or systems.',
    moreInfo: 'Once inside, adversaries explore to find where valuable data is stored or which systems are most critical.',
  },
  'lateral': {
    title: 'Lateral Movement',
    category: 'phase',
    description: 'Techniques used to move from one system to another in an environment.',
    moreInfo: 'Adversaries use this to "pivot" through the network until they find their ultimate target.',
  },
  'collection': {
    title: 'Collection',
    category: 'phase',
    description: 'Techniques used to gather information and the sources information is collected from.',
    moreInfo: 'This involves staging files, taking screenshots, or gathering data from local drives and cloud storage.',
  },
  'c2': {
    title: 'Command and Control (C2)',
    category: 'phase',
    description: 'How adversaries communicate with systems they have under their control within a target network.',
    moreInfo: 'These communications are often disguised as normal web traffic to avoid detection by firewalls.',
  },

  // CONCEPTS
  'indicators': {
    title: 'Indicators of Compromise (IOC)',
    category: 'concept',
    description: 'Evidence that a computer system has been breached or an attack is in progress.',
    moreInfo: 'Common IOCs include IP addresses, file hashes, URLs, and malicious domain names identified during forensic analysis.',
  },
  'threat-reports': {
    title: 'Threat Intelligence Reports',
    category: 'concept',
    description: 'Structured documents summarizing observed adversary behaviors, targets, and technical details.',
    moreInfo: 'These reports help defenders understand who is attacking them (attribution) and what techniques (TTPs) are being used.',
  },
  'attack-patterns': {
    title: 'Attack Patterns (TTPs)',
    category: 'concept',
    description: 'Tactics, Techniques, and Procedures (TTPs) used by threat actors.',
    moreInfo: 'MITRE ATT&CK is the industry standard framework for categorizing these patterns across different platforms and layers.',
  },
};
