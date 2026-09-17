// The practice's standard appointment catalogue, transcribed from the live
// Acuity booking page. This is the single source of truth for the "Load
// standard catalogue" action (see seedStandardCatalogue in lib/scheduling.ts),
// so dev and production get the same set. Loading is idempotent: an item is
// created only when no active type with the same name and mode already exists,
// so it is safe to run more than once and it never deletes anything.

import type { AppointmentMode } from "./scheduling";

export interface CatalogueItem {
  category: string;
  name: string;
  durationMin: number;
  mode: AppointmentMode;
  description?: string;
  capacity?: number;
}

const COUNSELLING_DESC =
  "Our counseling services encompass both individual and group sessions, extending support to individuals of all ages grappling with emotional, social, or behavioral difficulties. The overarching goal is to heighten individuals' awareness of challenges they may face in personal or professional spheres. Through tailored counseling, we impart the skills necessary to manage and regulate emotions, promoting mental health and fostering resilience.";

const ADHD_DESC = "This is one of 3 assessments for your ADHD diagnosis.";

const PSYCHOED_DESC =
  "Conducting thorough psycho-educational assessments is a cornerstone of our services. These assessments comprehensively evaluate an individual's intellectual functioning, academic achievement, and socio-emotional well-being. The results provide the foundation for personalized intervention strategies, including the development of Individualized Education Programs (IEPs), empowering parents and Special Education Needs Coordinators (SENCo) with the knowledge to assist learners effectively.";

const PEERS_DESC =
  "Our evidence-based social skills training programs, including PEERS, are specifically curated to help learners develop essential social and communication skills. Tailored programs for individuals with autism (ASD) and ADHD empower both learners and parents with tools to build positive relationships, enhance executive functioning skills, and succeed in diverse social settings.";

const PARENT_CHILD_DESC =
  "We extend consultations to parents/guardians, addressing concerns related to their child's behavior, social interactions, and academic development. These consultations are designed to foster collaboration between home and school, with the overarching aim of benefiting the learner by aligning efforts and strategies.";

const FREE_CONSULT_DESC =
  "This appointment is a chance to meet with one of our licensed professionals, explore whether therapy is the right fit for you, ask any questions, and receive a pricing quote based on your insurance.\n\nYou will receive an email confirming your appointment and providing you with a zoom link for your consultation. If you would like to request an in-person appointment, please email us at: Tifecscheduling@gmail.com";

export const STANDARD_CATALOGUE: CatalogueItem[] = [
  // ---- Free Online Consultation ----
  { category: "Free Online Consultation", name: "Free Online Consultation", durationMin: 20, mode: "virtual", description: FREE_CONSULT_DESC },

  // ---- Mental Health Care ----
  { category: "Mental Health Care", name: "Mental Health Care - In Person", durationMin: 60, mode: "in_person" },
  { category: "Mental Health Care", name: "Grief Counselling - In Person Appointment", durationMin: 60, mode: "in_person" },
  { category: "Mental Health Care", name: "Crisis Management - In Person", durationMin: 90, mode: "in_person" },
  { category: "Mental Health Care", name: "Counselling (Group & individual 1hr) - In Person", durationMin: 60, mode: "in_person", description: COUNSELLING_DESC },
  { category: "Mental Health Care", name: "Counselling (Group or Individual 2hr) - In Person", durationMin: 120, mode: "in_person", description: COUNSELLING_DESC },
  { category: "Mental Health Care", name: "Spiritual Care - In Person", durationMin: 60, mode: "in_person" },
  { category: "Mental Health Care", name: "Clinical Services - In Person", durationMin: 60, mode: "in_person" },
  { category: "Mental Health Care", name: "Corporate Consultation - In Person", durationMin: 60, mode: "in_person" },
  { category: "Mental Health Care", name: "ADHD Assessment 1 - In Person", durationMin: 60, mode: "in_person", description: ADHD_DESC },
  { category: "Mental Health Care", name: "ADHD Assessment 2 - In Person", durationMin: 60, mode: "in_person", description: ADHD_DESC },
  { category: "Mental Health Care", name: "ADHD Assessment 3 - In Person", durationMin: 60, mode: "in_person", description: ADHD_DESC },
  { category: "Mental Health Care", name: "Counselling (Group & individuals) - Online", durationMin: 60, mode: "virtual" },
  { category: "Mental Health Care", name: "Grief Counselling - Online", durationMin: 60, mode: "virtual" },
  { category: "Mental Health Care", name: "Crisis Management Counselling - Online", durationMin: 90, mode: "virtual" },
  { category: "Mental Health Care", name: "Mental Health Care - Online", durationMin: 60, mode: "virtual" },
  { category: "Mental Health Care", name: "Clinical Services - Online", durationMin: 60, mode: "virtual" },
  { category: "Mental Health Care", name: "Corporate Consultation - Online", durationMin: 60, mode: "virtual" },
  { category: "Mental Health Care", name: "Spiritual Care - Online", durationMin: 60, mode: "virtual" },

  // ---- PEERS, Psychological Assessment & Therapy ----
  { category: "PEERS, Psychological Assessment & Therapy", name: "Primary Group 1 - PEERS (6 years-10 years)", durationMin: 90, mode: "in_person" },
  { category: "PEERS, Psychological Assessment & Therapy", name: "High/Middle School PEERS (11 years-15 years)", durationMin: 90, mode: "in_person" },
  { category: "PEERS, Psychological Assessment & Therapy", name: "Young Adult (15+ years) - PEERS", durationMin: 90, mode: "in_person" },
  { category: "PEERS, Psychological Assessment & Therapy", name: "Psychoeducational Assessments - In Person (1hr)", durationMin: 60, mode: "in_person", description: PSYCHOED_DESC },
  { category: "PEERS, Psychological Assessment & Therapy", name: "Psychoeducational Assessment - In Person (3hr)", durationMin: 180, mode: "in_person" },
  { category: "PEERS, Psychological Assessment & Therapy", name: "Psychoeducational Assessment - In Person (2hr)", durationMin: 120, mode: "in_person" },
  { category: "PEERS, Psychological Assessment & Therapy", name: "PEERS Social skills Training - In Person", durationMin: 60, mode: "in_person", description: PEERS_DESC },
  { category: "PEERS, Psychological Assessment & Therapy", name: "PEERS Social skills Training - Online", durationMin: 60, mode: "virtual" },

  // ---- The Marriage Institute (Marriage & Family Care) ----
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Pre Marital Counselling - In Person", durationMin: 60, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Couples Counselling - In Person (1 hr)", durationMin: 60, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Couples Counselling - In Person (2 hrs)", durationMin: 120, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Marriage Counselling - In Person (1 Hr)", durationMin: 60, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Marriage Counselling - In Person (2 Hrs)", durationMin: 120, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Parent & Child Consultations - In Person", durationMin: 60, mode: "in_person", description: PARENT_CHILD_DESC },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Family and Relational Care - In Person", durationMin: 60, mode: "in_person" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Pre Marital Counselling - Online", durationMin: 60, mode: "virtual" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Couples Counselling - Online (1 hr)", durationMin: 60, mode: "virtual" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Marriage Counselling - Online (1.5 hrs)", durationMin: 90, mode: "virtual" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Parent & Child Consultations - Online", durationMin: 60, mode: "virtual" },
  { category: "The Marriage Institute (Marriage & Family Care)", name: "Family and Relational Care - Online", durationMin: 60, mode: "virtual" },
];
