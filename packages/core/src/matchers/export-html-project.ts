import * as M from '@meetalva/message';
import * as T from '@meetalva/types';
import * as Path from 'path';
import * as uuid from 'uuid';
import * as Export from '../export';
import * as Fs from 'fs';
import { MatcherCreator } from './context';

export const exportHtmlProject: MatcherCreator<M.ExportHtmlProject> = ({
	host,
	dataHost,
	location
}) => {
	return async m => {
		const app = await host.getApp(m.appId || '');

		if (!app) {
			host.log(`exportHtmlProject: received message without resolveable app: ${m}`);
			return;
		}

		const project = await dataHost.getProject(m.payload.projectId);

		if (!project) {
			host.log(`exportHtmlProject: received message without resolveable project: ${m}`);
			return;
		}

		if (!location) {
			host.log(`exportHtmlProject: received message without location: ${m}`);
			return;
		}

		const name = m.payload.path ? Path.basename(m.payload.path) : `${project.getName()}.html`;
		const targetPath =
			m.payload.path ||
			(await host.selectSaveFile({
				defaultPath: `/${name}`,
				title: `Export ${project.getName()} as HTML file`,
				filters: [
					{
						name: project.getName(),
						extensions: ['html', 'htm']
					}
				]
			}));

		if (!targetPath && host.type === T.HostType.Electron) {
			host.log(`exportHtmlProject: no targetPath for Electro Host`);
			return;
		}

		try {
			const htmlExport = await Export.exportHtmlProject({
				project,
				location
			});

			if (htmlExport.type === T.ExportResultType.ExportError) {
				app.send({
					type: M.MessageType.ShowError,
					transaction: m.transaction,
					id: uuid.v4(),
					payload: {
						message: `HTML Export for ${project.getName()} failed.`,
						detail: `It threw the following error: ${htmlExport.error.message}`,
						error: {
							message: htmlExport.error.message,
							stack: htmlExport.error.stack || ''
						}
					}
				});
				return;
			}

			const firstFileResult = await getFirstFile(htmlExport.fs);

			if (firstFileResult.type === FsResultType.FsError) {
				app.send({
					type: M.MessageType.ShowError,
					transaction: m.transaction,
					id: uuid.v4(),
					payload: {
						message: `HTML Export for ${project.getName()} failed.`,
						detail: `It threw the following error: ${firstFileResult.error.message}`,
						error: {
							message: firstFileResult.error.message,
							stack: firstFileResult.error.stack || ''
						}
					}
				});
				return;
			}

			await host.saveFile(`${project.getName()}.html`, firstFileResult.payload.toString());
			await host.writeFile(
				targetPath ? targetPath : `${project.getName()}.html`,
				firstFileResult.payload.toString()
			);
		} catch (err) {
			app.send({
				type: M.MessageType.ShowError,
				transaction: m.transaction,
				id: uuid.v4(),
				payload: {
					message: `HTML Export for ${project.getName()} failed.`,
					detail: `It threw the following error: ${err.message}`,
					error: {
						message: err.message,
						stack: err.stack || ''
					}
				}
			});
		}
	};
};

type FsResult<T> = FsError | FsSuccess<T>;

interface FsError {
	type: FsResultType.FsError;
	error: Error;
}

interface FsSuccess<T> {
	type: FsResultType.FsSuccess;
	payload: T;
}

enum FsResultType {
	FsError,
	FsSuccess
}

async function getFirstFile(fs: typeof Fs): Promise<FsResult<Buffer>> {
	try {
		const [firstFile] = fs.readdirSync('/');
		const firstFileContents = fs.readFileSync(`/${firstFile}`);

		return {
			type: FsResultType.FsSuccess,
			payload: firstFileContents
		};
	} catch (err) {
		return {
			type: FsResultType.FsError,
			error: err
		};
	}
}
