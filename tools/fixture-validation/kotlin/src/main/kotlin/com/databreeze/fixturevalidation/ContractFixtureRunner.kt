package com.databreeze.fixturevalidation

import com.databreeze.contracts.v1.parseV1Contract
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.absolute
import kotlin.io.path.readText

private val mapper: ObjectMapper = jacksonObjectMapper()

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

private fun runFixtures(arguments: Arguments) {
    val manifest = mapper.readTree(arguments.fixtureManifest.toFile())
    val fixtureRoot = requireNotNull(arguments.fixtureManifest.parent)
    val output = mapper.createObjectNode()
    output.put("runtime", "kotlin")
    val results = output.putArray("results")
    for (fixtureCase in manifest.required("cases")) {
        val source = fixtureRoot.resolve(fixtureCase.required("source").asText()).normalize()
        val payloadSource = source.readText()
        results.addObject()
            .put("caseId", fixtureCase.required("id").asText())
            .put(
                "accepted",
                parseV1Contract(
                    fixtureCase.required("schemaId").asText(),
                    payloadSource,
                ).accepted,
            )
    }
    Files.writeString(arguments.output, mapper.writeValueAsString(output) + "\n")
}

public fun main(arguments: Array<String>) {
    runFixtures(parseArguments(arguments))
}
