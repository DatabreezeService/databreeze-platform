package com.databreeze.android

import android.app.Application
import androidx.work.Configuration

/** Composition root. WorkManager receives only the typed, scope-bound worker factory. */
class DataBreezeApplication : Application(), Configuration.Provider {
    val runtime: AndroidRuntime by lazy(LazyThreadSafetyMode.SYNCHRONIZED) { AndroidRuntime.create(this) }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(runtime.workerFactory)
            .build()
}
