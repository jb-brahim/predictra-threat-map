export const sampleStixData = {
  type: "bundle",
  id: "bundle--1a17729f-de72-4d1a-82dc-391a92e10531",
  spec_version: "2.1",
  objects: [
    // Threat Actors
    {
      type: "threat-actor",
      id: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "IRGC-Affiliated Actors (CyberAv3ngers)",
      description: "Iranian Government Islamic Revolutionary Guard Corps (IRGC) affiliated cyber actors.",
      threat_actor_types: ["nation-state"],
      aliases: ["CyberAv3ngers"]
    },
    
    // Malware / Tools
    {
      type: "malware",
      id: "malware--7bba3623-2895-4eb8-b9a6-1addcd82fc79",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Defacement Script",
      description: "Script used to deface Unitronics PLCs with anti-Israel messaging.",
      is_family: false
    },
    {
      type: "tool",
      id: "tool--4a2c5ea4-cc4d-4e4f-b64d-ebb67f70b790",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Default Port Scanner",
      description: "Scanner looking for TCP port 20256."
    },

    // Vulnerabilities
    {
      type: "vulnerability",
      id: "vulnerability--3f4e2f83-e186-4bb6-ad7a-5df86b4020f5",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Unitronics Default Credentials",
      description: "Use of default passwords (e.g., 1111) on Unitronics Vision Series PLCs."
    },
    
    // Attack Patterns
    {
      type: "attack-pattern",
      id: "attack-pattern--c82c3dc8-de64-44df-9df5-2bc36b2cb9e8",
      spec_version: "2.1",
      name: "Exploit Public-Facing Application (T1190)",
      external_references: [
        { source_name: "mitre-attack", external_id: "T1190" }
      ]
    },
    {
      type: "attack-pattern",
      id: "attack-pattern--2f1b4028-ebaa-46d5-a3fb-0fa4ccaddaa7",
      spec_version: "2.1",
      name: "Valid Accounts (T1078)",
      external_references: [
        { source_name: "mitre-attack", external_id: "T1078" }
      ]
    },
    {
      type: "attack-pattern",
      id: "attack-pattern--e3a382ec-8be1-432a-bcbd-7f9fc67b7f43",
      spec_version: "2.1",
      name: "Defacement (T1491)",
      external_references: [
        { source_name: "mitre-attack", external_id: "T1491" }
      ]
    },

    // Sectors / Identities
    {
      type: "identity",
      id: "identity--a00ea24a-fb4c-4eb2-a1f0-0a2ca9cd1ba7",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Water and Wastewater Systems Sector",
      identity_class: "class"
    },
    {
      type: "identity",
      id: "identity--5e20790e-4dd5-45a8-b6ec-75fa630bb39b",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Energy Sector",
      identity_class: "class"
    },
    {
      type: "identity",
      id: "identity--6b3cd1f5-1fa5-47e0-9bc7-5ab35aed85dc",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Food and Agriculture Sector",
      identity_class: "class"
    },
    
    // Indicators (IPs, Hashes)
    {
      type: "indicator",
      id: "indicator--d18f4ad8-297d-4b95-aef5-2b4faba0d654",
      created: "2024-03-01T10:00:00.000Z",
      modified: "2024-03-01T10:00:00.000Z",
      name: "Malicious IP 178.162.227.X",
      pattern: "[ipv4-addr:value = '178.162.227.100']",
      pattern_type: "stix",
      valid_from: "2024-03-01T10:00:00.000Z"
    },

    // Campaigns
    {
      type: "campaign",
      id: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87",
      name: "CyberAv3ngers PLC Targeting",
      description: "Widespread targeting of PLCs in critical infrastructure sectors globally."
    },

    // Relationships
    {
      type: "relationship",
      id: "relationship--a7c1a8c8-b4b3-462a-8ea1-42b7c638c11e",
      relationship_type: "attributed-to",
      source_ref: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87",
      target_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a"
    },
    {
      type: "relationship",
      id: "relationship--b638f220-4bf6-4ee4-9be1-0d31df83e5a2",
      relationship_type: "uses",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "tool--4a2c5ea4-cc4d-4e4f-b64d-ebb67f70b790"
    },
    {
      type: "relationship",
      id: "relationship--c5d7973c-6453-4eb0-80a5-f86a9dc17a58",
      relationship_type: "uses",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "malware--7bba3623-2895-4eb8-b9a6-1addcd82fc79"
    },
    {
      type: "relationship",
      id: "relationship--00f13a1a-4ab7-4fb8-8d05-4cde8b1ad698",
      relationship_type: "targets",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "vulnerability--3f4e2f83-e186-4bb6-ad7a-5df86b4020f5"
    },
    {
      type: "relationship",
      id: "relationship--4d50ebf9-f7f5-4424-bca5-b3a6ef06c3aa",
      relationship_type: "targets",
      source_ref: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87",
      target_ref: "identity--a00ea24a-fb4c-4eb2-a1f0-0a2ca9cd1ba7"
    },
    {
      type: "relationship",
      id: "relationship--b9cdb49a-e8d1-4475-ae90-c0b9380bd6fa",
      relationship_type: "targets",
      source_ref: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87",
      target_ref: "identity--5e20790e-4dd5-45a8-b6ec-75fa630bb39b"
    },
    {
      type: "relationship",
      id: "relationship--c6bf23d1-671f-4efc-8e0f-96a8497faae1",
      relationship_type: "targets",
      source_ref: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87",
      target_ref: "identity--6b3cd1f5-1fa5-47e0-9bc7-5ab35aed85dc"
    },
    {
      type: "relationship",
      id: "relationship--d8213aa4-d2e8-46cb-8ce6-c67be257ab6b",
      relationship_type: "uses",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "attack-pattern--c82c3dc8-de64-44df-9df5-2bc36b2cb9e8"
    },
    {
      type: "relationship",
      id: "relationship--29c490a6-583b-4886-90a6-1ed03f7e59c1",
      relationship_type: "uses",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "attack-pattern--2f1b4028-ebaa-46d5-a3fb-0fa4ccaddaa7"
    },
    {
      type: "relationship",
      id: "relationship--3ea1f95a-ddac-4a82-bdb6-fc8fc91c20c0",
      relationship_type: "uses",
      source_ref: "threat-actor--bdf1bfae-f633-4632-a567-ec682c0f657a",
      target_ref: "attack-pattern--e3a382ec-8be1-432a-bcbd-7f9fc67b7f43"
    },
    {
      type: "relationship",
      id: "relationship--78ae327a-eecf-41ad-99f2-2b62283da3e1",
      relationship_type: "indicates",
      source_ref: "indicator--d18f4ad8-297d-4b95-aef5-2b4faba0d654",
      target_ref: "campaign--3a9cfa28-4ce6-47b2-8ea8-3c3e80931d87"
    }
  ]
};
