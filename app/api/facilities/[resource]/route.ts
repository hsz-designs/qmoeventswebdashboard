import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { insertWithIdentityRecovery } from "@/lib/supabase/server";
import {
    facilityConfigurations,
    isFacilityResource,
    parseFacilityInput,
    validateFacilityReferences,
} from "../facility-api";

export const runtime = "nodejs";

type FacilityCollectionContext = {
    params: Promise<{ resource: string }>;
};

export async function POST(request: Request, context: FacilityCollectionContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const { resource } = await context.params;
    if (!isFacilityResource(resource)) {
        return Response.json({ error: "Unknown facility resource." }, { status: 404 });
    }

    const input = await parseFacilityInput(request, resource);
    if (input instanceof Response) return input;

    const referenceError = await validateFacilityReferences(resource, input);
    if (referenceError) return referenceError;

    const configuration = facilityConfigurations[resource];
    const { data, error } = await insertWithIdentityRecovery(
        configuration.table,
        input,
        configuration.select,
    );

    if (error) return databaseError(error, `Unable to create the ${resource.slice(0, -1)}.`);

    return Response.json({ record: data }, { status: 201 });
}
