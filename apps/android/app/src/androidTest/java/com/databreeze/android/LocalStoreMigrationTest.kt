package com.databreeze.android

import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.databreeze.android.storage.DataBreezeDatabase
import com.databreeze.android.storage.RoomLocalStore
import org.junit.Test
import org.junit.runner.RunWith

/** Verifies every schema version currently shipped can migrate to the current Room schema. */
@RunWith(AndroidJUnit4::class)
class LocalStoreMigrationTest {
    private val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        DataBreezeDatabase::class.java,
        emptyList(),
        FrameworkSQLiteOpenHelperFactory(),
    )

    @Test
    fun migrateV1ToCurrent() {
        helper.createDatabase("databreeze-migration.db", 1).close()
        helper.runMigrationsAndValidate(
            "databreeze-migration.db",
            3,
            true,
            RoomLocalStore.MIGRATION_1_2,
            RoomLocalStore.MIGRATION_2_3,
        )
    }
}
