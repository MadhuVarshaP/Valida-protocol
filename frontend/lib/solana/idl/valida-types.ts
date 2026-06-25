/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/valida.json`.
 */
export type Valida = {
  "address": "8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe",
  "metadata": {
    "name": "valida",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Valida Protocol — Solana Anchor program for patch management and vulnerability disclosure"
  },
  "instructions": [
    {
      "name": "decideResolution",
      "discriminator": [
        244,
        55,
        129,
        45,
        40,
        20,
        143,
        152
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        },
        {
          "name": "auditorLed",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "requiredStake",
          "type": "u64"
        }
      ]
    },
    {
      "name": "markPublished",
      "discriminator": [
        207,
        50,
        79,
        228,
        21,
        153,
        19,
        85
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "publishPatch",
      "discriminator": [
        145,
        176,
        249,
        46,
        68,
        68,
        110,
        216
      ],
      "accounts": [
        {
          "name": "patch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "config.patch_count",
                "account": "programConfig"
              }
            ]
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "softwareName",
          "type": "string"
        },
        {
          "name": "version",
          "type": "string"
        },
        {
          "name": "ipfsCid",
          "type": "string"
        },
        {
          "name": "fileHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "rejectSubmission",
      "discriminator": [
        2,
        92,
        1,
        81,
        148,
        156,
        6,
        160
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "releaseBounty",
      "discriminator": [
        208,
        104,
        178,
        53,
        137,
        16,
        74,
        64
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auditor",
          "writable": true,
          "relations": [
            "submission"
          ]
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        },
        {
          "name": "bountyAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "releaseFixIncentive",
      "discriminator": [
        148,
        210,
        81,
        171,
        228,
        148,
        202,
        100
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auditor",
          "writable": true,
          "relations": [
            "submission"
          ]
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        },
        {
          "name": "fixIncentiveAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "revealAndVerify",
      "discriminator": [
        47,
        108,
        117,
        24,
        137,
        164,
        189,
        77
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "auditor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        },
        {
          "name": "details",
          "type": "string"
        },
        {
          "name": "salt",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "revealedIpfsCid",
          "type": "string"
        }
      ]
    },
    {
      "name": "stakeAndSubmit",
      "discriminator": [
        164,
        145,
        94,
        123,
        167,
        131,
        104,
        161
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "config.submission_count",
                "account": "programConfig"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "config.submission_count",
                "account": "programConfig"
              }
            ]
          }
        },
        {
          "name": "usedNonce",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auditor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "templateType",
          "type": "u8"
        },
        {
          "name": "severity",
          "type": "u8"
        },
        {
          "name": "affectedSoftware",
          "type": "string"
        },
        {
          "name": "affectedVersion",
          "type": "string"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "systemCodeHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "stakeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "submitFixCommitment",
      "discriminator": [
        196,
        170,
        77,
        134,
        5,
        27,
        98,
        48
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "auditor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        },
        {
          "name": "fixCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "verifyFix",
      "discriminator": [
        114,
        48,
        228,
        201,
        223,
        191,
        254,
        253
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "verifyPatch",
      "discriminator": [
        128,
        85,
        104,
        41,
        145,
        176,
        84,
        27
      ],
      "accounts": [
        {
          "name": "patch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "patchId"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "patchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "verifySubmission",
      "discriminator": [
        162,
        234,
        254,
        35,
        18,
        111,
        138,
        59
      ],
      "accounts": [
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  117,
                  108,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "submissionId"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "submissionId",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "escrowAccount",
      "discriminator": [
        36,
        69,
        48,
        18,
        128,
        225,
        125,
        135
      ]
    },
    {
      "name": "patchRecord",
      "discriminator": [
        255,
        206,
        30,
        55,
        33,
        38,
        36,
        162
      ]
    },
    {
      "name": "programConfig",
      "discriminator": [
        196,
        210,
        90,
        231,
        144,
        149,
        140,
        63
      ]
    },
    {
      "name": "usedNonce",
      "discriminator": [
        212,
        222,
        157,
        252,
        130,
        71,
        179,
        238
      ]
    },
    {
      "name": "vulnerabilitySubmission",
      "discriminator": [
        222,
        253,
        108,
        122,
        238,
        245,
        88,
        219
      ]
    }
  ],
  "events": [
    {
      "name": "bountyReleased",
      "discriminator": [
        56,
        153,
        231,
        87,
        185,
        70,
        138,
        108
      ]
    },
    {
      "name": "fixCommitmentSubmitted",
      "discriminator": [
        22,
        125,
        40,
        65,
        233,
        83,
        80,
        13
      ]
    },
    {
      "name": "fixIncentiveReleased",
      "discriminator": [
        59,
        8,
        110,
        156,
        113,
        197,
        33,
        177
      ]
    },
    {
      "name": "fixVerified",
      "discriminator": [
        25,
        144,
        247,
        32,
        207,
        69,
        246,
        226
      ]
    },
    {
      "name": "fraudDetected",
      "discriminator": [
        209,
        35,
        62,
        181,
        16,
        63,
        49,
        183
      ]
    },
    {
      "name": "patchPublished",
      "discriminator": [
        218,
        212,
        130,
        192,
        0,
        162,
        168,
        196
      ]
    },
    {
      "name": "patchPublishedForSubmission",
      "discriminator": [
        234,
        193,
        159,
        19,
        145,
        209,
        222,
        143
      ]
    },
    {
      "name": "patchVerified",
      "discriminator": [
        162,
        118,
        102,
        134,
        105,
        248,
        176,
        96
      ]
    },
    {
      "name": "programInitialized",
      "discriminator": [
        43,
        70,
        110,
        241,
        199,
        218,
        221,
        245
      ]
    },
    {
      "name": "resolutionDecided",
      "discriminator": [
        26,
        66,
        52,
        48,
        214,
        72,
        3,
        142
      ]
    },
    {
      "name": "submissionRejected",
      "discriminator": [
        222,
        120,
        204,
        232,
        51,
        196,
        71,
        146
      ]
    },
    {
      "name": "submissionVerified",
      "discriminator": [
        146,
        176,
        127,
        216,
        229,
        41,
        139,
        4
      ]
    },
    {
      "name": "vulnerabilityRevealed",
      "discriminator": [
        26,
        222,
        154,
        194,
        47,
        39,
        78,
        38
      ]
    },
    {
      "name": "vulnerabilitySubmitted",
      "discriminator": [
        213,
        58,
        4,
        137,
        246,
        184,
        203,
        210
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedAdmin",
      "msg": "Only admin can perform this action"
    },
    {
      "code": 6001,
      "name": "unauthorizedAuditor",
      "msg": "Only the submitting auditor can perform this action"
    },
    {
      "code": 6002,
      "name": "invalidStatusTransition",
      "msg": "Submission status does not allow this action"
    },
    {
      "code": 6003,
      "name": "bountyNotYetEligible",
      "msg": "Bounty can only be released after proof is verified — status must be Verified"
    },
    {
      "code": 6004,
      "name": "fixIncentiveNotYetEligible",
      "msg": "Fix incentive can only be released after fix is validated — status must be FixVerified"
    },
    {
      "code": 6005,
      "name": "nonceAlreadyUsed",
      "msg": "This nonce has already been used — replay attack detected"
    },
    {
      "code": 6006,
      "name": "commitmentMismatch",
      "msg": "Commitment verification failed — details do not match original submission"
    },
    {
      "code": 6007,
      "name": "alreadyPaid",
      "msg": "Payment already released"
    },
    {
      "code": 6008,
      "name": "alreadySlashed",
      "msg": "Stake already slashed"
    },
    {
      "code": 6009,
      "name": "insufficientStake",
      "msg": "Insufficient stake — must meet required_stake minimum"
    },
    {
      "code": 6010,
      "name": "notAuditorLedFix",
      "msg": "Fix incentive only applies when auditor was assigned the fix (8B path)"
    },
    {
      "code": 6011,
      "name": "nothingToSlash",
      "msg": "Cannot slash — no stake remaining"
    }
  ],
  "types": [
    {
      "name": "bountyReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "bountyAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "escrowAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "stakedAmount",
            "type": "u64"
          },
          {
            "name": "bountyAmount",
            "type": "u64"
          },
          {
            "name": "fixIncentiveAmount",
            "type": "u64"
          },
          {
            "name": "stakeReturned",
            "type": "bool"
          },
          {
            "name": "bountyReleased",
            "docs": [
              "INCENTIVE #1"
            ],
            "type": "bool"
          },
          {
            "name": "fixIncentiveReleased",
            "docs": [
              "INCENTIVE #2"
            ],
            "type": "bool"
          },
          {
            "name": "slashed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fixCommitmentSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fixIncentiveReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "fixIncentiveAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fixVerified",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fraudDetected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "patchPublished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "patchId",
            "type": "u64"
          },
          {
            "name": "softwareName",
            "type": "string"
          },
          {
            "name": "ipfsCid",
            "type": "string"
          },
          {
            "name": "fileHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "patchPublishedForSubmission",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "patchRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "softwareName",
            "type": "string"
          },
          {
            "name": "version",
            "type": "string"
          },
          {
            "name": "ipfsCid",
            "type": "string"
          },
          {
            "name": "fileHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isVerified",
            "type": "bool"
          },
          {
            "name": "publishedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "patchVerified",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "patchId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "programConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "requiredStake",
            "type": "u64"
          },
          {
            "name": "submissionCount",
            "type": "u64"
          },
          {
            "name": "patchCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "programInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "requiredStake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "resolutionDecided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditorLed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "submissionRejected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "stakeSlashed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "submissionVerified",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "usedNonce",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "used",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vulnerabilityRevealed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "ipfsCid",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "vulnerabilitySubmission",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "templateType",
            "type": "u8"
          },
          {
            "name": "severity",
            "type": "u8"
          },
          {
            "name": "affectedSoftware",
            "type": "string"
          },
          {
            "name": "affectedVersion",
            "type": "string"
          },
          {
            "name": "status",
            "docs": [
              "0=Pending 1=Verified 2=Rejected 3=Revealed 4=FixInProgress 5=FixVerified 6=Published"
            ],
            "type": "u8"
          },
          {
            "name": "bountyPaid",
            "docs": [
              "INCENTIVE #1 — paid for finding the bug (Step 5 only)"
            ],
            "type": "bool"
          },
          {
            "name": "fixIncentivePaid",
            "docs": [
              "INCENTIVE #2 — paid for fixing the bug (Step 9 only)"
            ],
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "systemCodeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "auditorLed",
            "docs": [
              "true = 8B (auditor fixes), false = 8A (team fixes internally)"
            ],
            "type": "bool"
          },
          {
            "name": "fixCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitmentVerified",
            "type": "bool"
          },
          {
            "name": "fraudDetected",
            "type": "bool"
          },
          {
            "name": "revealedIpfsCid",
            "docs": [
              "filled at Step 6 (reveal_and_verify)"
            ],
            "type": "string"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vulnerabilitySubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "submissionId",
            "type": "u64"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "templateType",
            "type": "u8"
          },
          {
            "name": "severity",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
