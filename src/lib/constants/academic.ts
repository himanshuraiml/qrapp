export interface InstitutionHierarchy {
  name: string
  branches: string[]
}

export const ACADEMIC_HIERARCHY: Record<string, string[]> = {
  'FET': [
    'CSE',
    'CSE-AIML',
    'AI&DS',
    'ECE',
    'Mechanical',
    'IT',
    'Civil',
    'EEE',
  ],
  'Faculty of Science and Humanities (FSH)': [
    'BCA',
    'B.Sc CS',
    'Commerce',
    'BBA',
    'Mathematics',
  ],
  'Faculty of Management': [
    'MBA',
    'BBA',
  ],
}

export const DEFAULT_INSTITUTIONS = Object.keys(ACADEMIC_HIERARCHY)

export function getBranchesForInstitution(institution?: string | null): string[] {
  if (!institution) return []
  
  // Exact or normalized match
  if (ACADEMIC_HIERARCHY[institution]) {
    return ACADEMIC_HIERARCHY[institution]
  }

  // Handle shorthand matching like 'FSH'
  const matchedKey = Object.keys(ACADEMIC_HIERARCHY).find((k) =>
    k.toLowerCase().includes(institution.toLowerCase()) || institution.toLowerCase().includes(k.toLowerCase().split(' ')[0])
  )

  return matchedKey ? ACADEMIC_HIERARCHY[matchedKey] : []
}
