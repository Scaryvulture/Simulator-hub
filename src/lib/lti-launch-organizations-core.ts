export type LtiReportingScope = {
    reportingOrganizationId: string
    requiresAdditionalMembership: boolean
}

export function resolveLtiReportingScope(params: {
    baseOrganizationId: string
    reportingOrganizationId?: string | null
}): LtiReportingScope {
    const overrideOrganizationId =
        typeof params.reportingOrganizationId === 'string'
            ? params.reportingOrganizationId.trim()
            : ''
    const reportingOrganizationId = overrideOrganizationId || params.baseOrganizationId

    return {
        reportingOrganizationId,
        requiresAdditionalMembership: reportingOrganizationId !== params.baseOrganizationId,
    }
}
