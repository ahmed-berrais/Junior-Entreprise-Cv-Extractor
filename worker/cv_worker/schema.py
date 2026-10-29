"""Source of truth for extraction, profile drafts and web forms (S1-15)."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

# Proposed taxonomy: design §4.1 was not available in the repository or ClickUp.
# Ahmed/Farouk must confirm these values before release; change them only here.
Domain = Literal[
    "software_engineering", "data_ai", "cybersecurity", "cloud_devops",
    "networks_telecom", "embedded_iot", "business_management", "marketing_design", "other",
]
Month = Annotated[str, Field(pattern=r"^$|^[0-9]{4}-(0[1-9]|1[0-2])$")]
EndMonth = Annotated[str, Field(pattern=r"^$|^present$|^[0-9]{4}-(0[1-9]|1[0-2])$")]
WebLink = Annotated[str, Field(pattern=r"^$|^https?://[^\s]+$")]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Links(Model):
    linkedin: WebLink = Field(default="", description="LinkedIn URL as printed, or empty if absent.")
    github: WebLink = Field(default="", description="GitHub URL as printed, or empty if absent.")
    portfolio: WebLink = Field(default="", description="Portfolio URL as printed, or empty if absent.")


class Basics(Model):
    name: str = Field(default="", description="Candidate's full name exactly as stated in the CV.")
    email: str = Field(default="", pattern=r"^$|^[^\s@]+@[^\s@]+\.[^\s@]+$",
                       description="Contact email from the CV; empty if absent.")
    phone: str = Field(default="", description="Contact phone including country code when stated.")
    city: str = Field(default="", description="Candidate's city, only when stated.")
    country: str = Field(default="", description="Candidate's country, only when stated.")
    headline: str = Field(default="", description="One-line professional headline in the CV language.")
    summary: str = Field(default="", description="Professional summary, without invented information.")
    links: Links = Field(default_factory=Links, description="Public professional links in the CV.")


class Education(Model):
    school: str = Field(default="", description="Name of the school or university.")
    degree: str = Field(default="", description="Degree or qualification as stated.")
    field: str = Field(default="", description="Field of study as stated.")
    start: Month = Field(default="", description="Start in YYYY-MM format; empty if unknown.")
    end: EndMonth = Field(default="", description="End in YYYY-MM, 'present' if ongoing, or empty.")


class Experience(Model):
    company: str = Field(default="", description="Employer or organisation name.")
    role: str = Field(default="", description="Job or internship title as stated.")
    start: Month = Field(default="", description="Start in YYYY-MM format; empty if unknown.")
    end: EndMonth = Field(default="", description="End in YYYY-MM, 'present' if ongoing, or empty.")
    description: str = Field(default="", description="Responsibilities and results stated in the CV.")


class Project(Model):
    name: str = Field(default="", description="Project title as stated.")
    description: str = Field(default="", description="Project description without invented results.")
    technologies: list[str] = Field(default_factory=list, description="Only technologies explicitly used.")


class Language(Model):
    language: str = Field(default="", description="Name of the spoken or written language.")
    level: str = Field(default="", description="Proficiency as stated; do not invent a level.")


class Certification(Model):
    name: str = Field(default="", description="Certification title as stated.")
    issuer: str = Field(default="", description="Issuing organisation as stated.")
    year: str = Field(default="", pattern=r"^$|^[0-9]{4}$",
                      description="Award year in YYYY format; empty if unknown.")


class Classification(Model):
    domain: Domain | None = Field(default=None, description="Best fitting fixed domain; null if unknown.")
    seniority: Literal["student", "junior", "experienced"] | None = Field(
        default=None, description="Student, junior or experienced based only on CV evidence.")
    years_experience: float | None = Field(
        default=None, ge=0, description="Years of work experience; null when it cannot be determined.")


class ExtractedProfile(Model):
    """Pass this model to Mistral/Gemini. It deliberately excludes looking_for."""

    basics: Basics = Field(default_factory=Basics, description="Candidate's personal information.")
    availability: str = Field(default="", description="Availability stated in the CV; empty if absent.")
    education: list[Education] = Field(default_factory=list, description="All stated education entries.")
    experience: list[Experience] = Field(default_factory=list, description="All stated work entries.")
    projects: list[Project] = Field(default_factory=list, description="All stated projects.")
    skills: list[str] = Field(default_factory=list, description="Only skills actually stated in the CV.")
    languages: list[Language] = Field(default_factory=list, description="All stated languages and levels.")
    certifications: list[Certification] = Field(default_factory=list, description="All stated certificates.")
    classification: Classification = Field(default_factory=Classification,
                                          description="Evidence-based professional classification.")


class CandidateProfile(ExtractedProfile):
    looking_for: Literal["pfe", "internship", "job"] | None = Field(
        default=None, description="Chosen by the candidate at upload; never inferred by the AI.")
