package com.databreeze.fixturevalidation

import com.databreeze.contracts.v1.ActorMetadata
import com.databreeze.contracts.v1.CommandEnvelope
import com.databreeze.contracts.v1.CorrelationMetadata
import com.databreeze.contracts.v1.CursorPage
import com.databreeze.contracts.v1.EventEnvelope
import com.databreeze.contracts.v1.Identifier
import com.databreeze.contracts.v1.OrganizationScope
import com.databreeze.contracts.v1.ProblemDetails
import com.databreeze.contracts.v1.ProjectScope
import com.databreeze.contracts.v1.Revision
import com.databreeze.contracts.v1.TenantScope
import com.databreeze.contracts.v1.UtcTimestamp
import com.databreeze.contracts.v1.WorkspaceScope
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.networknt.schema.InputFormat
import com.networknt.schema.SchemaLocation
import com.networknt.schema.SchemaRegistry
import com.networknt.schema.SpecificationVersion
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.absolute
import kotlin.io.path.readText

private const val SCHEMA_BASE = "https://schemas.databreeze.dev/contracts/v1"

@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.EXISTING_PROPERTY,
    property = "scopeType",
    visible = false,
)
@JsonSubTypes(
    JsonSubTypes.Type(value = OrganizationScope::class, name = "organization"),
    JsonSubTypes.Type(value = WorkspaceScope::class, name = "workspace"),
    JsonSubTypes.Type(value = ProjectScope::class, name = "project"),
)
private interface TenantScopeMixin

private val mapper: ObjectMapper = jacksonObjectMapper()
    .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    .addMixIn(TenantScope::class.java, TenantScopeMixin::class.java)

private data class Arguments(
    val fixtureManifest: Path,
    val output: Path,
)

private fun parseArguments(arguments: Array<String>): Arguments {
    var fixtureManifest: Path? = null
    var output: Path? = null
    var index = 0
    while (index < arguments.size) {
        val value = arguments.getOrNull(index + 1)
            ?: error("${arguments[index]} requires a path")
        when (arguments[index]) {
            "--fixture-manifest" -> fixtureManifest = Path.of(value).absolute().normalize()
            "--output" -> output = Path.of(value).absolute().normalize()
            else -> error("Unknown argument: ${arguments[index]}")
        }
        index += 2
    }
    return Arguments(
        fixtureManifest = requireNotNull(fixtureManifest) { "--fixture-manifest is required" },
        output = requireNotNull(output) { "--output is required" },
    )
}

private fun schemaRegistry(fixtureManifest: Path, manifest: JsonNode): SchemaRegistry {
    val fixtureRoot = requireNotNull(fixtureManifest.parent)
    val schemaManifestPath = fixtureRoot.resolve(manifest.required("schemaManifest").asText()).normalize()
    val contractRoot = requireNotNull(schemaManifestPath.parent)
    val schemaManifest = mapper.readTree(schemaManifestPath.toFile())
    val schemas = schemaManifest.required("schemas").associate { entry ->
        val id = entry.required("id").asText()
        val source = contractRoot.resolve(entry.required("path").asText()).normalize().readText()
        id to source
    }
    return SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12) { builder ->
        builder.schemas(schemas)
    }
}

private fun identifier(payload: JsonNode): Identifier =
    mapper.treeToValue(payload, String::class.java)

private fun revision(payload: JsonNode): Revision = payload.longValue()

private fun utcTimestamp(payload: JsonNode): UtcTimestamp =
    mapper.treeToValue(payload, String::class.java)

private fun constructGeneratedModel(schemaId: String, payload: JsonNode): Any = when (schemaId) {
    "$SCHEMA_BASE/actor-metadata" -> mapper.treeToValue(payload, ActorMetadata::class.java)
    "$SCHEMA_BASE/command-envelope" -> mapper.convertValue(
        payload,
        object : TypeReference<CommandEnvelope<Map<String, Any?>>>() {},
    )
    "$SCHEMA_BASE/correlation-metadata" -> mapper.treeToValue(
        payload,
        CorrelationMetadata::class.java,
    )
    "$SCHEMA_BASE/cursor-page" -> mapper.convertValue(
        payload,
        object : TypeReference<CursorPage<JsonNode>>() {},
    )
    "$SCHEMA_BASE/event-envelope" -> mapper.convertValue(
        payload,
        object : TypeReference<EventEnvelope<Map<String, Any?>>>() {},
    )
    "$SCHEMA_BASE/identifier" -> identifier(payload)
    "$SCHEMA_BASE/problem-details" -> mapper.treeToValue(payload, ProblemDetails::class.java)
    "$SCHEMA_BASE/revision" -> revision(payload)
    "$SCHEMA_BASE/tenant-scope" -> mapper.treeToValue(payload, TenantScope::class.java)
    "$SCHEMA_BASE/utc-timestamp" -> utcTimestamp(payload)
    else -> error("No generated Kotlin model for $schemaId")
}

private fun acceptsFixture(
    registry: SchemaRegistry,
    schemaId: String,
    payloadSource: String,
    payload: JsonNode,
): Boolean {
    val schema = registry.getSchema(SchemaLocation.of(schemaId))
    val errors = schema.validate(payloadSource, InputFormat.JSON) { executionContext ->
        executionContext.executionConfig { configuration ->
            configuration.formatAssertionsEnabled(true)
        }
    }
    if (errors.isNotEmpty()) return false
    return try {
        constructGeneratedModel(schemaId, payload)
        true
    } catch (_: Exception) {
        false
    }
}

private fun runFixtures(arguments: Arguments) {
    val manifest = mapper.readTree(arguments.fixtureManifest.toFile())
    val registry = schemaRegistry(arguments.fixtureManifest, manifest)
    val fixtureRoot = requireNotNull(arguments.fixtureManifest.parent)
    val output = mapper.createObjectNode()
    output.put("runtime", "kotlin")
    val results = output.putArray("results")
    for (fixtureCase in manifest.required("cases")) {
        val source = fixtureRoot.resolve(fixtureCase.required("source").asText()).normalize()
        val payloadSource = source.readText()
        val payload = mapper.readTree(payloadSource)
        results.addObject()
            .put("caseId", fixtureCase.required("id").asText())
            .put(
                "accepted",
                acceptsFixture(
                    registry,
                    fixtureCase.required("schemaId").asText(),
                    payloadSource,
                    payload,
                ),
            )
    }
    Files.writeString(arguments.output, mapper.writeValueAsString(output) + "\n")
}

public fun main(arguments: Array<String>) {
    runFixtures(parseArguments(arguments))
}
