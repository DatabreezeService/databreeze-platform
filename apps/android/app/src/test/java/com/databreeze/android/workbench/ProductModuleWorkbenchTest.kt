package com.databreeze.android.workbench

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductModuleWorkbenchTest {
    @Test
    fun `AND-016 workbench exposes the ten product modules in the approved plan order`() {
        assertEquals(
            listOf(
                "folder-autopilot",
                "spreadsheet-auditor",
                "quote-intelligence",
                "operations-capture",
                "invoice-leak-detector",
                "client-report-factory",
                "private-data-analyst",
                "migration-ready",
                "data-quality-guard",
                "embedded-importer",
            ),
            ProductModuleWorkbench.modules.map(AndroidProductModule::id),
        )
    }

    @Test
    fun `AND-017 every workbench module has distinct stable identity and complete display resources`() {
        val modules = ProductModuleWorkbench.modules

        assertEquals(10, modules.map(AndroidProductModule::id).distinct().size)
        assertEquals(10, modules.map(AndroidProductModule::requirementPrefix).distinct().size)
        assertTrue(modules.all { it.id.matches(Regex("[a-z]+(?:-[a-z]+)*")) })
        assertTrue(modules.all { it.requirementPrefix.matches(Regex("[A-Z]{2,3}")) })
        assertTrue(modules.all { it.titleRes != 0 && it.summaryRes != 0 && it.roleRes != 0 })
    }

    @Test
    fun `AND-016 lookup only accepts the catalog identifier`() {
        assertNotNull(ProductModuleWorkbench.find("operations-capture"))
        assertEquals(null, ProductModuleWorkbench.find("operations-capture/../../token"))
    }
}
